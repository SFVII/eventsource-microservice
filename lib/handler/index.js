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
const CommonResponse_1 = require("../core/CommonResponse");
const db_client_1 = require("@eventstore/db-client");
const timerBeforeReboot = 0.5 * 1000 * 60;
class EventHandler {
    constructor(EvenStoreConfig, streamList, triggerOnComplete = [], group = 'global-event-handler') {
        this.triggerOnComplete = [];
        this.group = group;
        this.streamList = streamList;
        this.triggerOnComplete = triggerOnComplete || [];
        this.client = new global_1.EventStoreDBClient(EvenStoreConfig.connexion, EvenStoreConfig.security, EvenStoreConfig.credentials);
        this.init().catch((err) => {
            console.log('Error Constructor._EventHandler', err);
            setTimeout(() => {
                process.exit(1);
            }, timerBeforeReboot);
        });
    }
    async init() {
        this.StartRevision = {};
        this.stream = {};
        for (const stream of this.streamList) {
            console.log('subscribe to stream > %s', stream);
            this.StartRevision[stream] = global_1.END;
            await this.CreatePersistentSubscription(stream).catch((err) => console.warn('warning', err));
            this.stream[stream] = this.SubscribeToPersistent(stream);
        }
        Object.keys(this.stream).forEach((name) => this.dispatcher(this.stream[name]));
    }
    async dispatcher(subscription) {
        for await (const resolvedEvent of subscription) {
            const { event } = resolvedEvent;
            if (event) {
                // @ts-ignore
                if (event.metadata.state === "processing")
                    await this.handler(resolvedEvent);
                await subscription.ack(resolvedEvent);
            }
        }
    }
    async handler(event) {
        const eventParser = new CommonResponse_1.EventParser(event, true);
        const template = this.template(eventParser.type, eventParser.data, eventParser.metadata);
        console.log('isError', eventParser.isError, 'nextRoute', eventParser.nextRoute, 'state', eventParser.state, 'template', template);
        if (eventParser.isError)
            await this.client.appendToStream(eventParser.causation, [template])
                .catch((err) => {
                console.error(`Error EventHandler.handler.appendToStream.${eventParser.causation}`, err);
            });
        else if (eventParser.nextRoute)
            await this.client.appendToStream(eventParser.nextRoute, [template])
                .catch((err) => {
                console.error(`Error EventHandler.handler.appendToStream.${eventParser.causation}`, err);
            });
        else
            await this.client.appendToStream(eventParser.causation, [template])
                .catch((err) => {
                console.error(`Error EventHandler.handler.appendToStream.${eventParser.causation}`, err);
            });
    }
    template(type, data, metadata) {
        return (0, global_1.jsonEvent)({
            type,
            data,
            metadata
        });
    }
    SubscribeToPersistent(streamName) {
        return this.client.subscribeToPersistentSubscriptionToStream(streamName, this.group, {
            bufferSize: 20
        });
    }
    async CreatePersistentSubscription(streamName) {
        try {
            await this.client.createPersistentSubscriptionToStream(streamName, this.group, 
            // @ts-ignore
            (0, db_client_1.persistentSubscriptionToStreamSettingsFromDefaults)({ startFrom: global_1.END, NamedConsumerStrategy: 'DispatchToSingle' }), { credentials: this.credentials });
            return true;
        }
        catch (err) {
            const error = (err ? err.toString() : "").toLowerCase();
            const errorsReboot = ['CANCELLED', 'canceled', 'UNAVAILABLE'];
            if (error.includes('EXIST') || error.includes('exist')) {
                console.log('Persistent sudbscription %s already exist', streamName);
                return true;
            }
            else {
                for (const k of errorsReboot) {
                    if (error.includes(k)) {
                        console.error('Error EventHandler.CreatePersistentSubscription', k);
                        console.error('Error EventHandler.CreatePersistentSubscription', k);
                        const timerBeforeReboot = 0.5 * 1000 * 60;
                        console.log('calling pod reboot in %d ms', timerBeforeReboot);
                        setTimeout(() => {
                            process.exit(1);
                        }, timerBeforeReboot);
                    }
                }
            }
            return false;
        }
    }
}
exports.default = EventHandler;
