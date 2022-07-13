/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 10/02/2022
 **  @Description
 ***********************************************************/
import {
    EventEmitter,
    EventStoreDBClient,
    EventType,
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
    START,
    StreamSubscription
} from "../core/global";

import {JSONEventType, PARK, PersistentAction, RETRY} from "@eventstore/db-client";

class EventConsumer<Contributor> {
    public QueueTTL = 200;
    protected methods: Method;
    protected streamName: string;
    protected group: string;
    protected credentials: IEvenStoreConfig["credentials"];
    private eventEmitter = new EventEmitter();
    private client: EventStoreDBClient;
    private StartRevision: IStartRevisionValues | null;
    private stream: StreamSubscription;
    private readonly Queue: IQueue | IQueueCustom;
    private readonly publish: boolean;

    constructor(EvenStoreConfig: IEvenStoreConfig,
                StreamName: string,
                queue: IQueue | IQueueCustom = {
                    create: [],
                    update: [],
                    delete: [],
                    recover: [],
                },
                publish: boolean = false,
                group: IEventHandlerGroup = 'consumers') {

        this.publish = publish;
        this.Queue = {...queue, ...{worker: []}}
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

   /* exchange(stream: string, type: MethodList, data: any) {
        const template = this.template(type, data, {
          //  $correlationId: 'ddd',
            $causationId: this.streamName,
            state: 'trigger',
            causationRoute: []
        });
        this.client.appendToStream(stream, [template]).catch((err: any) => {
            console.error(`Error EventHandler.handler.appendToStream`, err);
        }).catch()
    }*/


    on(key: 'ready' & MethodList & string, callback: (message: any) => any) {
        this.eventEmitter.on(key, (msg: any) => {
            callback(msg)
        })
    }

    public AddToQueue(type: MethodList, ResolvedEvent: JSONEventType, name?: string) {
        if (!Array.isArray(this.Queue[type]) && name && this.Queue && this.Queue[type]) {
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


    public async handler(event: any, data: any, status: "error" | null = null) {
        console.log('Contributor', event.metadata.contributor);
        let template;
        if (status === "error") {
            template = this.template(event.type, data, {
                $correlationId: event.metadata.$correlationId,
                $causationId: event.streamId,
                state: status,
                causationRoute: [],
                typeOrigin: event.metadata.typeOrigin,
                contributor: event.metadata.contributor
            });
        } else {

            template = this.template(event.type, data, {
                $correlationId: event.metadata.$correlationId,
                $causationId: event.streamId,
                state: event.metadata.state,
                causationRoute: event.metadata.causationRoute,
                typeOrigin: event.metadata.typeOrigin,
                contributor: event.metadata.contributor
            });

            // Publish final result
            if (this.publish) {

                const publish = this.template(event.type, data, {
                    $correlationId: event.metadata.$correlationId,
                    $causationId: event.streamId,
                    state: 'delivered',
                    causationRoute: event.metadata.causationRoute,
                    typeOrigin: event.metadata.typeOrigin,
                    contributor: event.metadata.contributor
                });
                this.client.appendToStream(this.streamName + '-publish', [publish])
                    .catch((err: any) =>
                        console.error(`Error EventHandler.handler.appendToStream.${event.streamId}`, err))
            }
        }
        console.log('send event to > %s', event.metadata.$causationId);
        await this.client.appendToStream(event.metadata.$causationId, [template]).catch((err: any) => {
            console.error(`Error EventHandler.handler.appendToStream.${event.streamId}`, err);
        })

    }

    public async ack(event: any) {
        await this.subscription.ack(event);
    }

    public async nack(event: any, type: PersistentAction = PARK, reason: string = 'default') {
        await this.subscription.nack(type, reason, event);
    }

    public async retry(event: any, reason: string = 'default') {
        await this.subscription.nack(RETRY, reason, event);
    }

    private async init() {
        await this.CreatePersistentSubscription(this.streamName);
        this.StartRevision = null;
        this.stream = this.SubscribeToPersistent(this.streamName);
        this.eventEmitter.emit('ready', true);
        this.QueueListener();
    }

    private QueueListener() {
        setInterval(() => {
            Object.keys(this.Queue).forEach((type: MethodList) => {
                // @ts-ignore
                if (!Array.isArray(this.Queue[type])) {
                    // @ts-ignore
                    if (this.Queue[type] && Object.keys(this.Queue[type]).length) {
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
                                console.log('----------eventEmitter-------------' + type + '.' + subkey, stack)
                                this.eventEmitter.emit(type + '.' + subkey, stack);
                            }
                        })
                    }
                } else {
                    // @ts-ignore
                    if (this.Queue && this.Queue[type] && (this.Queue[type] as StreamSubscription[])?.length) {
                        const stack = (this.Queue[type] as StreamSubscription[]).splice(
                            0,
                            // @ts-ignore
                            ((this.Queue[type] as StreamSubscription[])?.length > 200 ? 200 : this.Queue[type]?.length)
                        )
                        console.log('----------eventEmitter-------------' + type , stack)
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

    private template(type: EventType, data: any, metadata: ITemplateEvent<Contributor>) {
        return jsonEvent({
            type,
            data,
            metadata
        })
    }

    private async CreatePersistentSubscription(streamName: string): Promise<boolean> {
        try {
            await this.client.createPersistentSubscription(
                streamName,
                this.group,
                persistentSubscriptionSettingsFromDefaults({
                    startFrom: START,
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


export default EventConsumer
