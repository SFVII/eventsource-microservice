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
class EventHandler {
    constructor(EvenStoreConfig, streamList, triggerOnComplete = [], group = 'global-event-handler') {
        this.triggerOnComplete = [];
        this.group = group;
        this.streamList = streamList;
        this.triggerOnComplete = triggerOnComplete || [];
        this.client = new global_1.EventStoreDBClient(EvenStoreConfig.connexion, EvenStoreConfig.security, EvenStoreConfig.credentials);
        this.init().catch((err) => {
            console.log('Error Constructor._EventHandler', err);
            process.exit(0);
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
                await this.handler(event);
                await subscription.ack(resolvedEvent);
            }
        }
    }
    async handler(event) {
        console.log('[EVENT TRACK] [%s] Incoming event error details: ', event.data);
        if (event.metadata && event.metadata.state === 'delivered') {
            //
        }
        else if (event.metadata && event.metadata.state === "error") {
            console.log('[EVENT TRACK] [%s] Incoming event error details: ', event.data);
            const template = this.template(event.type, event.data, {
                $correlationId: event.metadata.$correlationId,
                $causationId: event.metadata.$causationId,
                state: event.metadata.state,
                causationRoute: [],
                typeOrigin: event.metadata.typeOrigin,
                contributor: event.metadata?.contributor
            });
            await this.client.appendToStream(event.streamId, [template]).catch((err) => {
                console.error(`Error EventHandler.handler.appendToStream.${event.streamId}`, err);
            });
        }
        else if (event.metadata && Array.isArray(event.metadata.causationRoute)) {
            const Routes = event.metadata.causationRoute;
            const nextRoute = Routes.shift();
            if (nextRoute) {
                console.log('[EVENT TRACK] [%s] Incoming event (route > %s) \t\tnext event (%s)', event.metadata.state.toUpperCase(), nextRoute, (Routes && Routes.length ? Routes[0] : 'COMPLETED'));
                if (event.metadata && (event.metadata.state === 'processing')) {
                    if (nextRoute && Array.isArray(nextRoute)) {
                        const template = this.template(event.type, event.data, {
                            $correlationId: event.metadata.$correlationId,
                            $causationId: event.streamId,
                            state: "system",
                            causationRoute: nextRoute,
                            typeOrigin: event.metadata.typeOrigin,
                            contributor: event.metadata?.contributor
                        });
                        nextRoute.forEach((route) => this.client.appendToStream(route, [template])
                            .catch((err) => {
                            console.error(`Error EventHandler.handler.appendToStream.${nextRoute}`, err);
                        }));
                        event.metadata.causationRoute = Routes;
                        await this.handler(event);
                    }
                    else {
                        const template = this.template(event.type, event.data, {
                            $correlationId: event.metadata.$correlationId,
                            $causationId: event.streamId,
                            state: Routes.length ? "processing" : "completed",
                            causationRoute: Routes,
                            typeOrigin: event.metadata.typeOrigin,
                            contributor: event.metadata?.contributor
                        });
                        await this.client.appendToStream(nextRoute, [template]).catch((err) => {
                            console.error(`Error EventHandler.handler.appendToStream.${nextRoute}`, err);
                        });
                    }
                }
                else if (event.metadata.state === 'completed' && this.triggerOnComplete && this.triggerOnComplete.length) {
                    const template = this.template(event.type, event.data, {
                        $correlationId: event.metadata.$correlationId,
                        $causationId: event.streamId,
                        state: "trigger",
                        causationRoute: [],
                        typeOrigin: event.metadata.typeOrigin,
                        contributor: event.metadata?.contributor
                    });
                    const list = this.triggerOnComplete.filter((trigger) => trigger.causationId === event.metadata.$causationId && trigger.trigger.length);
                    list.forEach((trigger) => trigger.trigger.forEach((stream) => this.client.appendToStream(stream, [template]).catch((err) => console.error(`Error EventHandler.handler.appendToStream.${nextRoute}`, err))));
                }
                else if (event.metadata.state === 'completed') {
                    const template = this.template(event.type, event.data, {
                        $correlationId: event.metadata.$correlationId,
                        $causationId: event.streamId,
                        state: "completed",
                        causationRoute: [],
                        typeOrigin: event.metadata.typeOrigin,
                        contributor: event.metadata?.contributor
                    });
                    console.log('completed %s', event.$causationId);
                    this.client.appendToStream(event.$causationId, [template]).catch((err) => { console.log('err completed', err); });
                }
            }
            else {
                console.log('[EVENT TRACK] [%s] last step event )', event.metadata.state.toUpperCase());
            }
        }
        else {
            console.warn('BAD EVENT FORMAT', event);
        }
    }
    template(type, data, metadata) {
        return (0, global_1.jsonEvent)({
            type,
            data,
            metadata
        });
    }
    SubscribeToPersistent(streamName) {
        return this.client.subscribeToPersistentSubscription(streamName, this.group, {
            bufferSize: 10
        });
    }
    async CreatePersistentSubscription(streamName) {
        try {
            await this.client.createPersistentSubscription(streamName, this.group, (0, global_1.persistentSubscriptionSettingsFromDefaults)({
                startFrom: this.StartRevision[streamName],
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
exports.default = EventHandler;
