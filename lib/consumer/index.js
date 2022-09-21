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
        this.QueueTTL = 100;
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
    on(key, callback) {
        this.eventEmitter.on(key, (msg) => {
            console.log('key_consume : %s', key);
            const [type, main, sub_key] = key.split('.');
            // @ts-ignore
            const queue_length = sub_key ? this.Queue[main][sub_key]?.length : this.Queue[main]?.length;
            console.log('/ \t\tPACKET\t\t  >\n\n Job Length %d  Queue Length %d \n\n< \t\tPACKET\t\t  / \n', msg.length, queue_length);
            setTimeout(() => { callback(msg), 200; });
        });
    }
    AddToQueue(type, ResolvedEvent, name) {
        if (!Array.isArray(this.Queue[type]) && name && this.Queue && this.Queue[type]) {
            // @ts-ignore
            if (!this.Queue[type][name])
                this.Queue[type][name] = [];
            // @ts-ignore
            const shouldMerge = this.Merge(this.Queue[type][name], ResolvedEvent);
            // @ts-ignore
            if (shouldMerge !== false)
                this.Queue[type][name][shouldMerge] = ResolvedEvent;
            // @ts-ignore
            else
                this.Queue[type][name].push(ResolvedEvent);
        }
        else if (!name && this.Queue && this.Queue[type]) {
            // @ts-ignore
            const shouldMerge = this.Merge(this.Queue[type], ResolvedEvent);
            // @ts-ignore
            if (shouldMerge !== false)
                this.Queue[type][shouldMerge] = ResolvedEvent;
            // @ts-ignore
            else
                this.Queue[type].push(ResolvedEvent);
        }
        else {
            console.log('Error _EventConsumer.AddToQueue Queue does not exist');
        }
        /*
        
         */
    }
    async handler(eventParse) {
        let publish = null;
        // @ts-ignore
        if (!eventParse.isError && this.publish) {
            const pMetadata = { ...eventParse.metadata, state: 'delivered' };
            // @ts-ignore
            publish = this.template(eventParse.type, eventParse.data, pMetadata);
            this.client.appendToStream(this.streamName + '-publish', [publish])
                .catch((err) => console.error(`Error EventHandler.handler.appendToStream`, err));
        }
        const template = this.template(eventParse.type, eventParse.data, eventParse.metadata);
        await this.client.appendToStream(eventParse.causation, [template]).catch((err) => {
            console.error(`Error EventHandler.handler.appendToStream`, err);
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
    Merge(Q, event) {
        const index = Q.findIndex((e) => 
        // @ts-ignore
        e.event?.metadata?.$correlationId &&
            // @ts-ignore
            event.event?.metadata?.$correlationId &&
            // @ts-ignore
            e.event?.metadata?.$correlationId === event.event?.metadata?.$correlationId);
        //  console.log('Duplicate detection ? %s', index > -1)
        return index > -1 ? index : false;
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
                                ((this.Queue[type][subkey])?.length >= 100 ? 100 : this.Queue[type][subkey]?.length));
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
                        (this.Queue[type]?.length >= 100 ? 100 : this.Queue[type]?.length));
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
