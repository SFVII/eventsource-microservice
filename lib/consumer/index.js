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
        constructor(EvenStoreConfig, StreamName, group = 'consumers') {
            this.eventEmitter = new global_1.EventEmitter();
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
        AddToQueue(type, ResolvedEvent, taskQueue) {
            if (this.Queue && this.Queue[type]) {
                // @ts-ignore
                this.Queue[type].push(ResolvedEvent);
            }
            else
                console.log('Error _EventConsumer.AddToQueue Queue does not exist');
        }
        async SaveRevision(revision) {
            await _EventCollection
                .findOneAndUpdate({ StreamName: this.streamName }, { Revision: revision, UpdatedDate: new Date() })
                .lean();
        }
        async handler(event, data, status = null) {
            let template;
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
        async init() {
            const availableEvent = await _EventCollection.findOne({
                StreamName: this.streamName,
                Active: { $ne: false }
            }).select([
                'Revision',
                'IsCreatedPersistent'
            ]).lean();
            if (availableEvent) {
                this.StartRevision = availableEvent.Revision ? (0, global_1.bigInt)(availableEvent.Revision).add(1).valueOf() : global_1.END;
                const status = await this.CreatePersistentSubscription(this.streamName, availableEvent.IsCreatedPersistent);
                if (status)
                    this.stream = this.SubscribeToPersistent(this.streamName);
                this.eventEmitter.emit('ready', true);
                this.QueueListener();
            }
        }
        QueueListener() {
            setInterval(() => {
                Object.keys(this.Queue).forEach((type) => {
                    // @ts-ignore
                    if (this.Queue && this.Queue[type] && this.Queue[type]?.length) {
                        const stack = this.Queue[type].splice(0, (this.Queue[type]?.length > 200 ? 200 : this.Queue[type]?.length));
                        this.eventEmitter.emit(type, stack);
                    }
                });
            }, 200);
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
        async CreatePersistentSubscription(streamName, exist = false) {
            try {
                if (exist)
                    await this.client.deletePersistentSubscription(streamName, this.group);
                await this.client.createPersistentSubscription(streamName, this.group, (0, global_1.persistentSubscriptionSettingsFromDefaults)({
                    startFrom: this.StartRevision,
                    resolveLinkTos: true
                }), { credentials: this.credentials });
                if (!exist)
                    await _EventCollection.updateOne({
                        StreamName: streamName,
                        IsCreatedPersistent: true
                    }, { upsert: true }).exec();
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
