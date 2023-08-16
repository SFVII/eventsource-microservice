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
const SocketServer_1 = require("../core/SocketServer");
const Utils_1 = require("../core/Utils");
const timerBeforeReboot = 0.5 * 1000 * 60;
class EventHandler {
    constructor(EvenStoreConfig, streamList, triggerOnComplete = [], group = 'global-event-handler') {
        this.triggerOnComplete = [];
        this.StartRevision = {};
        this.stream = {};
        this.broker = new SocketServer_1.BrokerSocketServer();
        this.isSync = false;
        this.StreamMaxAge = 1;
        if (process.env.STREAM_MAX_AGE)
            this.StreamMaxAge = Number(process.env.STREAM_MAX_AGE);
        this.group = group;
        this.streamList = streamList;
        this.triggerOnComplete = triggerOnComplete || [];
        this.client = new global_1.EventStoreDBClient(EvenStoreConfig.connexion, EvenStoreConfig.security, EvenStoreConfig.credentials);
        /*	this.init().catch((err) => {
                console.log('Error Constructor._EventHandler', err);
                setTimeout(() => {
                    process.exit(1);
                }, timerBeforeReboot)
            })*/
        this.soronEye();
    }
    soronEye() {
        setInterval(async () => {
            if (!this.isSync)
                await this.getStreamList();
        }, 1000 * 30);
    }
    async getStreamList() {
        this.isSync = true;
        const peers = this.broker.getStreamNames;
        const existStreams = Object.keys(this.stream);
        // dispatcher-uploads_0
        console.debug('Peers', peers);
        const toCreate = peers.filter((e) => existStreams.indexOf(e) === -1);
        const toDelete = existStreams.filter((e) => peers.indexOf(e) === -1);
        if (toDelete.length) {
            console.debug('unsubscribe to >', toDelete);
            for (const stream of toDelete) {
                await (0, Utils_1.sleep)(2000);
                await this.stream[stream].unsubscribe().catch((err) => {
                    console.debug('stream can not be unsubscribe', stream, err);
                });
            }
        }
        if (toCreate.length) {
            console.debug('subscribe to >', toCreate);
            for (const peer of toCreate) {
                await (0, Utils_1.sleep)(2000);
                await this.initiateStream(peer);
                await (0, Utils_1.sleep)(2000);
                this.dispatcher(this.stream[peer]).catch(async (err) => {
                    console.log('ERROR.getStreamList', err);
                    await this.stream[peer].unsubscribe().catch((err) => {
                        console.debug('stream can not be unsubscribe', peer, err);
                    });
                    // @ts-ignore
                    this.stream[peer] = undefined;
                });
            }
        }
        this.isSync = false;
    }
    async initiateStream(stream) {
        console.log('subscribe to stream > %s', stream);
        this.StartRevision[stream] = global_1.END;
        await this.CreatePersistentSubscription(stream).catch((err) => console.warn('warning', err));
        this.stream[stream] = this.SubscribeToPersistent(stream);
    }
    /*private async init() {
        this.StartRevision = {};
        this.stream = {};
        for (const stream of this.streamList) {
            await this.initiateStream(stream);
            /*console.log('subscribe to stream > %s', stream)
            this.StartRevision[stream] = END;
            await this.CreatePersistentSubscription(stream).catch((err: any) => console.warn('warning', err));
            this.stream[stream] = this.SubscribeToPersistent(stream);
        }
        Object.keys(this.stream).forEach((name: string) => this.dispatcher(this.stream[name]))
    }*/
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
        /**/
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
            bufferSize: Number(process.env.BUFFER_SIZE_HANDLER) || 100
        });
    }
    async CreatePersistentSubscription(streamName) {
        try {
            await this.client.createPersistentSubscriptionToStream(streamName, this.group, 
            // @ts-ignore
            (0, db_client_1.persistentSubscriptionToStreamSettingsFromDefaults)({
                startFrom: global_1.END
            }), { credentials: this.credentials });
            const metadata = {
                maxAge: 3600 * 24 * this.StreamMaxAge
            };
            await this.client.setStreamMetadata(streamName, metadata);
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
