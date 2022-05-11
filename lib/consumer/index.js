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
const db_client_1 = require("@eventstore/db-client");
class EventConsumer {
    constructor(EvenStoreConfig, StreamName, queue = {
        create: [],
        update: [],
        delete: [],
        recover: [],
    }, publish = false, group = 'consumers') {
        this.QueueTTL = 200;
        this.eventEmitter = new global_1.EventEmitter();
        this.publish = publish;
        this.Queue = { ...queue, ...{ worker: [] } };
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
    exchange(stream, type, data) {
        const template = this.template(type, data, {
            //$correlationId: id,
            $causationId: this.streamName,
            state: 'trigger',
            causationRoute: []
        });
        this.client.appendToStream(stream, [template]).catch((err) => {
            console.error(`Error EventHandler.handler.appendToStream`, err);
        }).catch();
    }
    on(key, callback) {
        this.eventEmitter.on(key, (msg) => {
            callback(msg);
        });
    }
    AddToQueue(type, ResolvedEvent, name) {
        if (!Array.isArray(this.Queue[type]) && name && this.Queue && this.Queue[type]) {
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
            // Publish final result
            if (this.publish) {
                console.log('stream ' + this.streamName);
                this.client.appendToStream(this.streamName + '-publish', [template])
                    .catch((err) => console.error(`Error EventHandler.handler.appendToStream.${event.streamId}`, err));
            }
        }
        console.log('send event to > %s', event.metadata.$causationId);
        await this.client.appendToStream(event.metadata.$causationId, [template]).catch((err) => {
            console.error(`Error EventHandler.handler.appendToStream.${event.streamId}`, err);
        });
    }
    async ack(event) {
        await this.subscription.ack(event);
    }
    async nack(event, type = db_client_1.PARK, reason = 'default') {
        await this.subscription.nack(type, reason, event);
    }
    async retry(event, reason = 'default') {
        await this.subscription.nack(db_client_1.RETRY, reason, event);
    }
    async init() {
        await this.CreatePersistentSubscription(this.streamName);
        this.StartRevision = null;
        this.stream = this.SubscribeToPersistent(this.streamName);
        this.eventEmitter.emit('ready', true);
        this.QueueListener();
    }
    QueueListener() {
        setInterval(() => {
            Object.keys(this.Queue).forEach((type) => {
                // @ts-ignore
                if (!Array.isArray(this.Queue[type])) {
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
            await this.client.createPersistentSubscription(streamName, this.group, (0, global_1.persistentSubscriptionSettingsFromDefaults)({
                startFrom: global_1.START,
                resolveLinkTos: true
            }), { credentials: this.credentials });
            return true;
        }
        catch (err) {
            const error = (err ? err.toString() : "").toLowerCase();
            if (error.includes('EXIST') || error.includes('exist')) {
                console.log('Persistent subscription %s already exist', streamName);
                return true;
            }
            else
                console.error('Error EventHandler.CreatePersistentSubscription', err);
            return false;
        }
    }
}
exports.default = EventConsumer;
