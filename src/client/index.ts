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
    EventCollection,
    EventData,
    EventStoreDBClient,
    EventType,
    IEvenStoreConfig,
    IReadStreamConfig,
    IStartRevisionValues,
    ITemplateEvent,
    jsonEvent,
    JSONType,
    md5,
    Method,
    MethodList,
    StreamSubscription
} from "../core/global";
import {IEventCollection} from "../core/mongo-plugin";

const EventsPlugin = (mongoose: any) => {
    const _EventCollection = EventCollection(mongoose);
    return class _EventsPlugin<DataModel extends JSONType> {
        protected methods: Method;
        protected streamName: string;
        protected client: EventStoreDBClient;
        protected credentials: IEvenStoreConfig["credentials"];
        private StartRevision: IStartRevisionValues;
        private stream: StreamSubscription;
        private readonly causationRoute: string[];

        constructor(EvenStoreConfig: IEvenStoreConfig,
                    streamName: string,
                    methods: Method,
                    causationRoute: string[]) {
            this.methods = methods;
            this.streamName = streamName;
            this.client = new EventStoreDBClient(
                EvenStoreConfig.connexion,
                EvenStoreConfig.security,
                EvenStoreConfig.credentials);
            this.credentials = EvenStoreConfig.credentials;
            this.causationRoute = causationRoute;
            this.init().catch((err) => {
                console.log('EventsPlugin', err);
            })
        }

        public async add(data: DataModel | DataModel[]) {
            const method = 'create';
            const {payload, requestId} = await this.EventMiddlewareEmitter(data, method)
            return {
                payload: payload,
                delivered: async () => {
                    const eventEnd = this.template(method, payload, {
                        $correlationId: requestId,
                        state: 'delivered',
                        $causationId: this.streamName,
                        causationRoute: this.causationRoute
                    })
                    await this.appendToStream(this.streamName, eventEnd);
                }
            };
        }

        public async update(data: DataModel | DataModel[]) {
            const method = 'update';
            const {payload, requestId} = await this.EventMiddlewareEmitter(data, method)
            return {
                payload: payload,
                delivered: async () => {
                    const eventEnd = this.template(method, payload, {
                        $correlationId: requestId,
                        state: 'delivered',
                        $causationId: this.streamName,
                        causationRoute: this.causationRoute
                    })
                    await this.appendToStream(this.streamName, eventEnd);
                }
            };
        }

        public async delete(data: DataModel | DataModel[]) {
            const method = 'delete';
            const {payload, requestId} = await this.EventMiddlewareEmitter(data, method)
            return {
                payload: payload,
                delivered: async () => {
                    const eventEnd = this.template(method, payload, {
                        $correlationId: requestId,
                        state: 'delivered',
                        $causationId: this.streamName,
                        causationRoute: this.causationRoute
                    })
                    await this.appendToStream(this.streamName, eventEnd);
                }
            };
        }

        private async EventMiddlewareEmitter(data: DataModel | DataModel[], method: MethodList) {
            const requestId = this.GenerateEventInternalId(data, method);
            const streamName = `${this.streamName}`
            let state: DataModel | DataModel[] | "processing" | null = await this.processStateChecker(requestId);
            if (state === "processing") {
                console.log('Is Processing', state);
                return await this.eventCompletedHandler(method, requestId);
            } else if (!state) {
                const template = this.template(method, data, {
                    $correlationId: requestId,
                    state: 'processing',
                    $causationId: this.streamName,
                    causationRoute: this.causationRoute
                })
                console.log('My template ---_> ', template)
                const event = await this.appendToStream(streamName, template);
                console.log('My fresh Event', streamName, event)
                if (event) {
                    state = await this.eventCompletedHandler(method, requestId);
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

        private async eventCompletedHandler(method: MethodList, EventId: string) {
            let data = null;
            console.log('------> stream', this.stream);
            if (!this.stream)
                await this.init();
            console.log('-----> stream again', this.stream);
            if (this.stream) {
                // @ts-ignore
                for await (const resolvedEvent of this.stream) {
                    const {event}: any = resolvedEvent;
                    console.log('received event---->', event)
                    if (event && event.metadata?.$correlationId === EventId
                        && (event.metadata?.state === 'completed' || event.metadata?.state === 'error')) {
                        data = event.data;
                        break;
                    }
                }
            }
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

        private getStreamCorrelation(correlationId: string) {
            try {
                const subscription = this.client.readStream(
                    `$bc-${correlationId}`,
                    this.readStreamConfig(this.credentials));
                return subscription;
            } catch (error) {
                console.error(error)
            }

            return this.getMainStream();
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
                                    break;
                                // In case of complete we send the last information to the user
                                case 'completed':
                                    data = event.data;
                                    break;
                                // In case of processing we transparency send the user to the pending room
                                case 'processing':
                                    data = event.metadata?.state
                                    break;
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
            const streamName = `${this.streamName}`;
            const exist: IEventCollection = await _EventCollection.findOne({StreamName: streamName}).lean();
            this.StartRevision = exist && exist.Revision ? BigInt(exist.Revision) : END;
            if (!exist) {
                await this.appendToStream(streamName, this.template('init', {init: true},
                    {state: 'stalled'}))
            }
            this.stream = this.client.subscribeToStream(streamName, {
                fromRevision: this.StartRevision,
                resolveLinkTos: true
            })
        }

        private template(type: EventType, data: DataModel | DataModel[] | any, metadata: ITemplateEvent) {
            return jsonEvent({
                type,
                data,
                metadata
            })
        }

        private GenerateEventInternalId(data: DataModel | DataModel[], method: MethodList) {
            return md5(JSON.stringify({payload: data, method}));
        }
    };
}
export default EventsPlugin;

