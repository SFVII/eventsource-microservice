/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 10/02/2022
 **  @Description
 ***********************************************************/
import {
    bigInt,
    END,
    EventCollection,
    EventEmitter,
    EventStoreDBClient,
    EventType,
    IAvailableEvent,
    IEvenStoreConfig,
    IEventHandlerGroup,
    IQueue,
    IQueueCustom,
    IStartRevisionValues,
    ITemplateEvent,
    jsonEvent,
    Method,
    MethodList,
    PersistentSubscription,
    PersistentSubscriptionBase,
    persistentSubscriptionSettingsFromDefaults,
    StreamSubscription
} from "../core/global";


const EventConsumer = (mongoose: any) => {
    const _EventCollection = EventCollection(mongoose);
    return class _EventConsumer {
        public QueueTTL = 200;
        protected methods: Method;
        protected streamName: string;
        protected group: string;
        protected credentials: IEvenStoreConfig["credentials"];
        private eventEmitter = new EventEmitter();
        private client: EventStoreDBClient;
        private StartRevision: IStartRevisionValues;
        private stream: StreamSubscription;
        private readonly customQueue: boolean;
        private readonly Queue: IQueue | IQueueCustom;

        constructor(EvenStoreConfig: IEvenStoreConfig,
                    StreamName: string,
                    group: IEventHandlerGroup = 'consumers', customQueue = false) {
            this.customQueue = customQueue;
            if (customQueue) this.Queue = {
                create: {},
                update: {},
                delete: {}
            }
            else this.Queue = {
                create: [],
                update: [],
                delete: []
            }
            this.streamName = StreamName;
            this.group = group;
            this.client = new EventStoreDBClient(
                EvenStoreConfig.connexion,
                EvenStoreConfig.security,
                EvenStoreConfig.credentials);
            this.init().catch((err) => {
                console.log('Error Constructor._EventHandler', err);
            })
        }

        get subscription(): PersistentSubscription {
            return <PersistentSubscriptionBase<any>>this.stream;
        }

        on(key: 'ready' & MethodList, callback: (message: any) => void) {
            this.eventEmitter.on(key, (msg: any) => {
                callback(msg)
            })
        }

        public AddToQueue(type: MethodList, ResolvedEvent: StreamSubscription, name?: string) {
            if (this.customQueue && name && this.Queue && this.Queue[type]) {
                // @ts-ignore
                if (!this.Queue[type][name]) this.Queue[type][name] = [];
                // @ts-ignore
                this.Queue[type][name].push(ResolvedEvent);
            } else if (!name && this.Queue && this.Queue[type]) {
                // @ts-ignore
                this.Queue[type].push(ResolvedEvent);
            } else {
                console.log('Error _EventConsumer.AddToQueue Queue does not exist')
            }
        }

        public async SaveRevision(revision: bigint) {
            await _EventCollection
                .findOneAndUpdate({StreamName: this.streamName}, {Revision: revision, UpdatedDate: new Date()})
                .lean()
        }

        public async handler(event: any, data: any, status: string | null = null) {
            let template;
            if (status === "error") {
                template = this.template(event.type, data, {
                    $correlationId: event.metadata.$correlationId,
                    $causationId: event.streamId,
                    state: status,
                    causationRoute: []
                });

            } else {
                template = this.template(event.type, data, {
                    $correlationId: event.metadata.$correlationId,
                    $causationId: event.streamId,
                    state: event.metadata.state,
                    causationRoute: event.metadata.causationRoute
                });
            }
            console.log('send event to >', event.metadata.$causationId, template);
            await this.client.appendToStream(event.metadata.$causationId, [template]).catch((err: any) => {
                console.error(`Error EventHandler.handler.appendToStream.${event.streamId}`, err);
            })
        }

        private async init() {
            const availableEvent: IAvailableEvent = await _EventCollection.findOne({
                StreamName: this.streamName,
                Active: {$ne: false}
            }).select([
                'Revision',
                'IsCreatedPersistent'
            ]).lean();
            if (availableEvent) {
                this.StartRevision = availableEvent.Revision ? (bigInt(availableEvent.Revision).add(1).valueOf() as unknown as bigint) : END;
                const status = await this.CreatePersistentSubscription(
                    this.streamName,
                    availableEvent.IsCreatedPersistent);
                if (status)
                    this.stream = this.SubscribeToPersistent(this.streamName);
                this.eventEmitter.emit('ready', true);
                this.QueueListener();
            }
        }

        private QueueListener() {
            setInterval(() => {
                Object.keys(this.Queue).forEach((type: MethodList) => {
                    // @ts-ignore
                    if (this.customQueue) {
                        // @ts-ignore
                        Object.keys(this.Queue[type]).forEach((subkey: string) => {
                            // @ts-ignore
                            if (this.Queue && this.Queue[type] && this.Queue[type][subkey]
                                // @ts-ignore
                                && (this.Queue[type][subkey] as StreamSubscription[])?.length) {
                                // @ts-ignore
                                const stack = (this.Queue[type][subkey] as StreamSubscription[]).splice(
                                    0,
                                    // @ts-ignore
                                    ((this.Queue[type][subkey])?.length > 200 ? 200 : this.Queue[type][subkey]?.length)
                                )
                                this.eventEmitter.emit(type + '.' + subkey, stack);
                            }
                        })
                    } else {
                        // @ts-ignore
                        if (this.Queue && this.Queue[type] && (this.Queue[type] as StreamSubscription[])?.length) {
                            const stack = (this.Queue[type] as StreamSubscription[]).splice(
                                0,
                                // @ts-ignore
                                ((this.Queue[type] as StreamSubscription[])?.length > 200 ? 200 : this.Queue[type]?.length)
                            )
                            this.eventEmitter.emit(type, stack);
                        }
                    }
                });
            }, this.QueueTTL);
        }

        private SubscribeToPersistent(streamName: string) {
            return this.client.subscribeToPersistentSubscription(
                streamName,
                this.group
            )
        }

        private template(type: EventType, data: any, metadata: ITemplateEvent) {
            return jsonEvent({
                type,
                data,
                metadata
            })
        }

        private async CreatePersistentSubscription(streamName: string, exist: boolean = false): Promise<boolean> {
            try {
                if (exist) await this.client.deletePersistentSubscription(streamName, this.group)
                await this.client.createPersistentSubscription(
                    streamName,
                    this.group,
                    persistentSubscriptionSettingsFromDefaults({
                        startFrom: this.StartRevision,
                        resolveLinkTos: true
                    }),
                    {credentials: this.credentials}
                )
                if (!exist) await _EventCollection.updateOne({
                    StreamName: streamName,
                    IsCreatedPersistent: true
                }, {upsert: true}).exec();
                return true;
            } catch (err) {
                console.error('Error EventHandler.CreatePersistentSubscription', err);
                return false;
            }
        }
    }

}


export default EventConsumer
