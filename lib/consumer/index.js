"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 10/02/2022
 **  @Description
 ***********************************************************/
const global_1 = require("../core/global");
const EventConsumer = (mongoose) => {
    const _EventCollection = (0, global_1.EventCollection)(mongoose);
    return class _EventConsumer {
        constructor(EvenStoreConfig, StreamName, group = 'consumers', customQueue = false) {
            this.QueueTTL = 200;
            this.eventEmitter = new global_1.EventEmitter();
            this.customQueue = customQueue;
            if (customQueue)
                this.Queue = {
                    create: {},
                    update: {},
                    delete: {}
                };
            else
                this.Queue = {
                    create: [],
                    update: [],
                    delete: []
                };
            this.streamName = StreamName;
            this.group = group;
            this.client = new global_1.EventStoreDBClient(EvenStoreConfig.connexion, EvenStoreConfig.security, EvenStoreConfig.credentials);
            this.init().catch((err) => {
                console.log('Error Constructor._EventHandler', err);
            });
        }
        get subscription() {
            return this.stream;
        }
        on(key, callback) {
            this.eventEmitter.on(key, (msg) => {
                callback(msg);
            });
        }
        AddToQueue(type, ResolvedEvent, name) {
            if (this.customQueue && name && this.Queue && this.Queue[type]) {
                // @ts-ignore
                if (!this.Queue[type][name])
                    this.Queue[type][name] = [];
                // @ts-ignore
                this.Queue[type][name].push(ResolvedEvent);
            }
            else if (!name && this.Queue && this.Queue[type]) {
                // @ts-ignore
                this.Queue[type].push(ResolvedEvent);
            }
            else {
                console.log('Error _EventConsumer.AddToQueue Queue does not exist');
            }
        }
        async SaveRevision(revision) {
            await _EventCollection
                .findOneAndUpdate({ StreamName: this.streamName }, { Revision: revision, UpdatedDate: new Date() })
                .lean();
        }
        async handler(event, data, status = null) {
            let template;
            let statement;
            if (status === "error") {
                template = this.template(event.type, data, {
                    $correlationId: event.metadata.$correlationId,
                    $causationId: event.streamId,
                    state: status,
                    causationRoute: []
                });
            }
            else {
                template = this.template(event.type, data, {
                    $correlationId: event.metadata.$correlationId,
                    $causationId: event.streamId,
                    state: event.metadata.state,
                    causationRoute: event.metadata.causationRoute
                });
            }
            console.log('send event to >', event.metadata.$causationId, template);
            await this.client.appendToStream(event.metadata.$causationId, [template]).catch((err) => {
                console.error(`Error EventHandler.handler.appendToStream.${event.streamId}`, err);
            });
        }
        async ack(event) {
            await this.subscription.ack(event);
            /*  await _EventCollection.updateOne({
                  StreamName: this.streamName,
                  IsCreatedPersistent: true
              }, {Revision: event.event.revision, UpdatedDate: new Date()}, {upsert: true}).exec();*/
        }
        async init() {
            const availableEvent = await _EventCollection.findOne({
                StreamName: this.streamName,
                Active: { $ne: false }
            }).select([
                'Revision',
                'IsCreatedPersistent'
            ]).lean();
            if (availableEvent) {
                // availableEvent.Revision ? (bigInt(availableEvent.Revision).add(1).valueOf() as unknown as bigint) : END;
                // const state = await this.CreatePersistentSubscription(this.streamName);
                this.StartRevision = global_1.START;
                this.stream = this.SubscribeToPersistent(this.streamName);
                this.eventEmitter.emit('ready', true);
                this.QueueListener();
            }
        }
        QueueListener() {
            setInterval(() => {
                Object.keys(this.Queue).forEach((type) => {
                    // @ts-ignore
                    if (this.customQueue) {
                        // @ts-ignore
                        if (this.Queue[type] && Object.keys(this.Queue[type]).length) {
                            // @ts-ignore
                            Object.keys(this.Queue[type]).forEach((subkey) => {
                                // @ts-ignore
                                if (this.Queue && this.Queue[type] && this.Queue[type][subkey]
                                    // @ts-ignore
                                    && this.Queue[type][subkey]?.length) {
                                    // @ts-ignore
                                    const stack = this.Queue[type][subkey].splice(0, 
                                    // @ts-ignore
                                    ((this.Queue[type][subkey])?.length > 200 ? 200 : this.Queue[type][subkey]?.length));
                                    this.eventEmitter.emit(type + '.' + subkey, stack);
                                }
                            });
                        }
                    }
                    else {
                        // @ts-ignore
                        if (this.Queue && this.Queue[type] && this.Queue[type]?.length) {
                            const stack = this.Queue[type].splice(0, 
                            // @ts-ignore
                            (this.Queue[type]?.length > 200 ? 200 : this.Queue[type]?.length));
                            this.eventEmitter.emit(type, stack);
                        }
                    }
                });
            }, this.QueueTTL);
        }
        SubscribeToPersistent(streamName) {
            return this.client.subscribeToPersistentSubscription(streamName, this.group);
        }
        template(type, data, metadata) {
            return (0, global_1.jsonEvent)({
                type,
                data,
                metadata
            });
        }
        async CreatePersistentSubscription(streamName) {
            try {
                //  if (exist) await this.client.deletePersistentSubscription(streamName, this.group)
                await this.client.createPersistentSubscription(streamName, this.group, (0, global_1.persistentSubscriptionSettingsFromDefaults)({
                    startFrom: this.StartRevision,
                    resolveLinkTos: true
                }), { credentials: this.credentials });
                await _EventCollection.updateOne({
                    StreamName: streamName
                }, { IsCreatedPersistent: true }, { upsert: true }).exec();
                return true;
            }
            catch (err) {
                console.error('Error EventHandler.CreatePersistentSubscription', err);
                return false;
            }
        }
    };
};
exports.default = EventConsumer;
