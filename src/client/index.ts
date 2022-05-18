/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 09/02/2022
 **  @Description
 ***********************************************************/
import {
    BACKWARDS,
    END,
    EventData,
    EventStoreDBClient,
    IEvenStoreConfig,
    IReadStreamConfig,
    IStartRevisionValues,
    ITemplateEvent,
    jsonEvent,
    md5,
    StreamSubscription
} from "../core/global";

class EventsPlugin<DataModel> {
    protected methods: string[];
    protected streamName: string;
    protected client: EventStoreDBClient;
    protected credentials: IEvenStoreConfig["credentials"];
    private StartRevision: IStartRevisionValues;
    private stream: StreamSubscription;
    private readonly causationRoute: string[];

    constructor(EvenStoreConfig: IEvenStoreConfig,
                streamName: string,
                methods: string[],
                causationRoute: string[]) {
        this.methods = methods;
        this.streamName = streamName;
        this.client = new EventStoreDBClient(
            EvenStoreConfig.connexion,
            EvenStoreConfig.security,
            EvenStoreConfig.credentials);
        this.credentials = EvenStoreConfig.credentials;
        this.causationRoute = causationRoute;
        for (const method of this.methods) {
            // @ts-ignore
            this[method] = async (data: DataModel | DataModel[], streamName?: string, causationRoute?: string[]) => {
                const {payload, requestId} = await this.EventMiddlewareEmitter(data, method, streamName, causationRoute)
                return {
                    data: payload,
                    ack: this.delivered(requestId, method, payload,
                        streamName ? streamName : this.streamName,
                        [])
                        .bind(this)
                };
            }
        }
    }

    private delivered(requestId: string,
                      method: string,
                      payload: any,
                      streamName: string,
                      causationRoute: string[]) {
        const eventEnd = this.template(method, payload, {
            $correlationId: requestId,
            state: 'delivered',
            $causationId: streamName,
            causationRoute: causationRoute
        })
        const appendToStream = this.appendToStream.bind(this);
        return () => setTimeout(() => appendToStream(streamName, eventEnd), 500)
    }

    private async EventMiddlewareEmitter(data: DataModel | DataModel[],
                                         method: string,
                                         _streamName?: string,
                                         causationRoute?: string[]) {
        const requestId = this.GenerateEventInternalId(data, method);
        const streamName = _streamName ? _streamName : this.streamName
        let state: DataModel | DataModel[] | "processing" | null = await this.processStateChecker(requestId);
        if (state === "processing") {
            return await this.eventCompletedHandler(streamName, requestId);
        } else if (state) {
            return {payload: state, requestId};
        } else {
            const template = this.template(method, data, {
                $correlationId: requestId,
                state: 'processing',
                $causationId: this.streamName,
                causationRoute: this.causationRoute
            })
            const event = await this.appendToStream(streamName, template);
            if (event) {
                state = await this.eventCompletedHandler(streamName, requestId);
            }
        }
        return {payload: state, requestId};
    }

    private async appendToStream(streamName: string, template: EventData) {
        return await this.client.appendToStream(streamName,
            [template])
            .catch((err) => {
                console.log('Error EventsPlugin.add', err)
                new Error('Error system : ' + err);
            })
    }

    private async eventCompletedHandler(streamName: string, EventId: string) {
        let data = null;
        const stream = this.client.subscribeToStream(streamName, {
            fromRevision: END,
            resolveLinkTos: true,
        })
        // @ts-ignore
        for await (const resolvedEvent of stream) {
            const {event}: any = resolvedEvent;
            if (event && event.metadata?.$correlationId === EventId
                && (event.metadata?.state === 'completed' || event.metadata?.state === 'error')) {
                data = event.data;
                /*this.StartRevision = BigInt(event.revision) > BigInt(100n)
                    ? BigInt(event.revision - 100n) : this.StartRevision;*/
                break;
            }
        }
        await stream.unsubscribe();
        return data;
    }

    private readStreamConfig = (credentials: IEvenStoreConfig["credentials"]): IReadStreamConfig => {
        return {
            direction: BACKWARDS,
            fromRevision: END,
            maxCount: 1000,
            credentials: credentials
        }
    }

    private getMainStream() {
        try {
            const subscription = this.client.readStream(
                this.streamName,
                this.readStreamConfig(this.credentials));
            return subscription;
        } catch (error) {
            console.error(error)
        }
        return null;
    }


    private async processStateChecker(EventId: string) {
        let data: any = null;
        try {

            const subscription = this.getMainStream();
            if (subscription) {
                for await (const resolvedEvent of subscription) {
                    const event: any = resolvedEvent.event;
                    if (event && event.metadata?.$correlationId === EventId) {
                        switch (event.metadata?.state) {
                            // In case of delivered we allow user to renew the entry
                            case 'delivered':
                                subscription.destroy();
                                return null;
                            // In case of complete we send the last information to the user
                            case 'completed':
                                subscription.destroy();
                                return event.data
                            // In case of processing we transparency send the user to the pending room
                            case 'processing':
                                subscription.destroy();
                                return event.metadata?.state
                            case 'error':
                                subscription.destroy();
                                return event.data
                        }
                    }
                }

            }
        } catch (err) {
            console.error('Error EventsPlugin.processStateChecker', err)
        }

        return data;
    }

    private async init() {

    }

    private template(type: string, data: DataModel | DataModel[] | any, metadata: ITemplateEvent) {
        return jsonEvent({
            type,
            data,
            metadata
        })
    }

    private GenerateEventInternalId(data: DataModel | DataModel[], method: string) {
        return md5(JSON.stringify({payload: data, method}));
    }
}

export default EventsPlugin;

