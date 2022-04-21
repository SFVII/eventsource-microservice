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
// @ts-ignore
const EventHandler = (mongoose) => {
    const _EventCollection = (0, global_1.EventCollection)(mongoose);
    return class _EventHandler {
        constructor(EvenStoreConfig, group = 'dispatch') {
            this.group = group;
            this.client = new global_1.EventStoreDBClient(EvenStoreConfig.connexion, EvenStoreConfig.security, EvenStoreConfig.credentials);
            this.init().catch((err) => {
                console.log('Error Constructor._EventHandler', err);
            });
        }
        async init() {
            this.StartRevision = {};
            this.stream = {};
            const availableEvent = await _EventCollection.find({
                Active: { $ne: false },
                Service: true
            }).select([
                'StreamName',
                'Revision',
                'Service',
                'IsCreatedPersistent'
            ]).lean();
            this.streamName = availableEvent.map((event) => event.StreamName);
            for (const EventStream of availableEvent) {
                this.StartRevision[EventStream.StreamName] = global_1.START;
                await this.CreatePersistentSubscription(EventStream.StreamName);
                this.stream[EventStream.StreamName] = this.SubscribeToPersistent(EventStream.StreamName);
            }
            Object.keys(this.stream).forEach((name) => this.dispatcher(this.stream[name]));
            // console.log(this.stream);
            console.log(availableEvent);
        }
        async dispatcher(subscription) {
            for await (const resolvedEvent of subscription) {
                const { event } = resolvedEvent;
                // console.log('Resolved Event --->', event);
                if (event) {
                    await this.handler(event);
                    await subscription.ack(resolvedEvent);
                    /* await _EventCollection.updateOne({StreamName: event.streamId}, {
                         Revision: event.revision,
                         UpdateDate: new Date()
                     }).exec()*/
                }
            }
        }
        async handler(event) {
            if (Array.isArray(event.metadata.causationRoute)) {
                console.log('EventHandler', event.metadata.causationRoute, event.metadata.state);
                const Routes = event.metadata.causationRoute;
                const nextRoute = Routes.shift();
                console.log('Next Route', nextRoute);
                if (nextRoute) {
                    if (event.metadata && event.metadata.state === "error") {
                        const template = this.template(event.type, event.data, {
                            $correlationId: event.metadata.$correlationId,
                            $causationId: event.metadata.$causationId,
                            state: event.metatada.state,
                            causationRoute: null
                        });
                        //console.log('send event to >', event.streamId, template);
                        await this.client.appendToStream(event.streamId, [template]).catch((err) => {
                            console.error(`Error EventHandler.handler.appendToStream.${event.streamId}`, err);
                        });
                    }
                    else if (event.metadata && (event.metadata.state === 'processing')) {
                        const template = this.template(event.type, event.data, {
                            $correlationId: event.metadata.$correlationId,
                            $causationId: event.streamId,
                            state: Routes.length ? "processing" : "completed",
                            causationRoute: Routes
                        });
                        // console.log('send event to >', nextRoute, template);
                        await this.client.appendToStream(nextRoute, [template]).catch((err) => {
                            console.error(`Error EventHandler.handler.appendToStream.${nextRoute}`, err);
                        });
                    }
                    else if (event.metadata.state === 'delivered') {
                        // @todo check if event.nack exist
                        //event.ack(event);
                    }
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
            return this.client.subscribeToPersistentSubscription(streamName, this.group);
        }
        async CreatePersistentSubscription(streamName) {
            try {
                await this.client.createPersistentSubscription(streamName, this.group, (0, global_1.persistentSubscriptionSettingsFromDefaults)({
                    startFrom: this.StartRevision[streamName],
                    resolveLinkTos: true
                }), { credentials: this.credentials });
                await _EventCollection.updateOne({
                    StreamName: streamName,
                    IsCreatedPersistent: true
                }).exec();
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
    };
};
exports.default = EventHandler;
