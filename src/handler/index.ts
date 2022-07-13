/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 10/02/2022
 **  @Description
 ***********************************************************/
import {
    END,
    EventStoreDBClient,
    IEvenStoreConfig,
    IEventHandlerGroup,
    IListStreamSubscription,
    IStartRevision,
    ITemplateEvent,
    ITriggerList,
    jsonEvent,
    Method,
    PersistentSubscription,
    persistentSubscriptionSettingsFromDefaults
} from "../core/global";

class EventHandler {
    protected methods: Method;
    protected streamName: string[];
    protected group: string;
    protected streamList: string[];
    protected credentials: IEvenStoreConfig["credentials"];
    protected triggerOnComplete: ITriggerList[] = [];
    private client: EventStoreDBClient;
    private StartRevision: IStartRevision;
    private stream: IListStreamSubscription;

    constructor(EvenStoreConfig: IEvenStoreConfig,
                streamList: string[],
                triggerOnComplete: ITriggerList[] = [],
                group: IEventHandlerGroup = 'global-event-handler') {
        this.group = group;
        this.streamList = streamList;
        this.triggerOnComplete = triggerOnComplete || [];
        this.client = new EventStoreDBClient(
            EvenStoreConfig.connexion,
            EvenStoreConfig.security,
            EvenStoreConfig.credentials);
        this.init().catch((err) => {
            console.log('Error Constructor._EventHandler', err);
            process.exit(0);
        })
    }

    private async init() {
        this.StartRevision = {};
        this.stream = {};
        for (const stream of this.streamList) {
            console.log('subscribe to stream > %s', stream)
            this.StartRevision[stream] = END;
            await this.CreatePersistentSubscription(stream).catch((err: any) => console.warn('warning', err));
            this.stream[stream] = this.SubscribeToPersistent(stream);
        }
        Object.keys(this.stream).forEach((name: string) => this.dispatcher(this.stream[name]))
    }

    private async dispatcher(subscription: PersistentSubscription) {
        for await (const resolvedEvent of subscription) {
            const {event} = resolvedEvent;
            if (event) {
                await this.handler(event);
                await subscription.ack(resolvedEvent);
            }
        }
    }

    private async handler(event: any) {
        console.log('[EVENT TRACK] [%s] Incoming event error details: ', event.data)
        if (event.metadata && event.metadata.state === 'delivered') {
            //
        } else if (event.metadata && event.metadata.state === "error") {
            console.log('[EVENT TRACK ERROR] Incoming event (%s) error details:', event.metadata.$correlationId, event.data)
            const template = this.template(event.type, event.data, {
                $correlationId: event.metadata.$correlationId,
                $causationId: event.metadata.$causationId,
                state: event.metadata.state,
                causationRoute: [],
                typeOrigin: event.metadata.typeOrigin,
                contributor: event.metadata?.contributor
            });
            await this.client.appendToStream(event.streamId, [template]).catch((err: any) => {
                console.error(`Error EventHandler.handler.appendToStream.${event.streamId}`, err);
            })
        } else if (event.metadata && Array.isArray(event.metadata.causationRoute)) {
            const Routes = event.metadata.causationRoute;
            const nextRoute: string | string[] | undefined = Routes.shift();
            if (nextRoute) {
               // console.log('[EVENT TRACK] [%s] Incoming event (route > %s) \t\tnext event (%s)', event.metadata.state.toUpperCase(), nextRoute, (Routes && Routes.length ? Routes[0] : 'COMPLETED'))
                if (event.metadata && (event.metadata.state === 'processing')) {
                    if (nextRoute && Array.isArray(nextRoute)) {
                        const template = this.template(event.type, event.data, {
                            $correlationId: event.metadata.$correlationId,
                            $causationId: event.streamId,
                            state: "system",
                            causationRoute: [],
                            typeOrigin: event.metadata.typeOrigin,
                            contributor: event.metadata?.contributor
                        });
                        nextRoute.forEach((route: string) => this.client.appendToStream(route, [template])
                            .catch((err: any) => {
                                console.error(`Error EventHandler.handler.appendToStream.${nextRoute}`, err);
                            }))
                        event.metadata.causationRoute = Routes;
                        await this.handler(event);
                    } else {
                        console.log('[EVENT TRACK] [%s] Incoming event (route > %s) \t\tnext event (%s)', event.metadata.state.toUpperCase(), nextRoute, (Routes && Routes.length ? Routes[0] : 'COMPLETED'))
                        const template = this.template(event.type, event.data, {
                            $correlationId: event.metadata.$correlationId,
                            $causationId: event.streamId,
                            state: Routes.length ? "processing" : "completed",
                            causationRoute: Routes,
                            typeOrigin: event.metadata.typeOrigin,
                            contributor: event.metadata?.contributor
                        });
                        console.log('Send data to %s', nextRoute)
                        await this.client.appendToStream(nextRoute, [template]).catch((err: any) => {
                            console.error(`Error EventHandler.handler.appendToStream.${nextRoute}`, err);
                        })
                    }
                } else if (event.metadata.state === 'completed' && this.triggerOnComplete && this.triggerOnComplete.length) {
                    const template = this.template(event.type, event.data, {
                        $correlationId: event.metadata.$correlationId,
                        $causationId: event.streamId,
                        state: "trigger",
                        causationRoute: [],
                        typeOrigin: event.metadata.typeOrigin,
                        contributor: event.metadata?.contributor
                    });
                    const list = this.triggerOnComplete.filter((trigger: ITriggerList) =>
                        trigger.causationId === event.metadata.$causationId && trigger.trigger.length)
                    list.forEach((trigger) => trigger.trigger.forEach((stream: string) =>
                        this.client.appendToStream(stream, [template]).catch((err: any) =>
                            console.error(`Error EventHandler.handler.appendToStream.${nextRoute}`, err))))
                } else if (event.metadata.state === 'completed') {
                    console.log('Entry in this', event.metadata.$correlationId);
                    const template = this.template(event.type, event.data, {
                        $correlationId: event.metadata.$correlationId,
                        $causationId: event.streamId,
                        state: "completed",
                        causationRoute: [],
                        typeOrigin: event.metadata.typeOrigin,
                        contributor: event.metadata?.contributor
                    });
                    console.log('completed %s', event.$causationId);
                    this.client.appendToStream(event.$causationId, [template]).catch((err: any) => {console.log('err completed', err) });
                }
            } else {
                console.log('[EVENT TRACK] [%s] last step event )', event.metadata.state.toUpperCase())
            }
        } else {
            console.warn('BAD EVENT FORMAT', event)
        }
    }

    private template(type: string, data: any, metadata: ITemplateEvent<any>) {
        return jsonEvent({
            type,
            data,
            metadata
        })
    }

    private SubscribeToPersistent(streamName: string) {
        return this.client.subscribeToPersistentSubscription(
            streamName,
            this.group,
            {
                bufferSize: 10
            }
        )
    }

    private async CreatePersistentSubscription(streamName: string): Promise<boolean> {
        try {
            await this.client.createPersistentSubscription(
                streamName,
                this.group,
                persistentSubscriptionSettingsFromDefaults({
                    startFrom: this.StartRevision[streamName],
                    resolveLinkTos: true
                }),
                {credentials: this.credentials}
            )
            return true;
        } catch (err) {
            const error = (err ? err.toString() : "").toLowerCase();
            if (error.includes('EXIST') || error.includes('exist')) {
                console.log('Persistent subscription %s already exist', streamName)
                return true;
            } else console.error('Error EventHandler.CreatePersistentSubscription', err);
            return false;
        }
    }
}

export default EventHandler
