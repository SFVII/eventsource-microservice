"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 09/02/2022
 **  @Description
 ***********************************************************/
const global_1 = require("../core/global");
const EventsPlugin = (mongoose) => {
    const _EventCollection = (0, global_1.EventCollection)(mongoose);
    return class _EventsPlugin {
        constructor(EvenStoreConfig, streamName, methods, causationRoute) {
            this.readStreamConfig = (credentials) => {
                return {
                    direction: global_1.BACKWARDS,
                    fromRevision: global_1.END,
                    maxCount: 1000,
                    credentials: credentials
                };
            };
            this.methods = methods;
            this.streamName = streamName;
            this.client = new global_1.EventStoreDBClient(EvenStoreConfig.connexion, EvenStoreConfig.security, EvenStoreConfig.credentials);
            this.credentials = EvenStoreConfig.credentials;
            this.causationRoute = causationRoute;
            this.init().catch((err) => {
                console.log('EventsPlugin', err);
            });
        }
        async add(data) {
            const method = 'create';
            const { payload, requestId } = await this.EventMiddlewareEmitter(data, method);
            return {
                data: payload,
                ack: this.delivered(requestId, method, payload, this.streamName, []).bind(this)
            };
        }
        async update(data) {
            const method = 'update';
            const { payload, requestId } = await this.EventMiddlewareEmitter(data, method);
            return {
                data: payload,
                ack: this.delivered(requestId, method, payload, this.streamName, []).bind(this)
            };
        }
        async delete(data) {
            const method = 'delete';
            const { payload, requestId } = await this.EventMiddlewareEmitter(data, method);
            return {
                data: payload,
                ack: this.delivered(requestId, method, payload, this.streamName, []).bind(this)
            };
        }
        delivered(requestId, method, payload, streamName, causationRoute) {
            const eventEnd = this.template(method, payload, {
                $correlationId: requestId,
                state: 'delivered',
                $causationId: streamName,
                causationRoute: causationRoute
            });
            const appendToStream = this.appendToStream.bind(this);
            return () => setTimeout(() => appendToStream(streamName, eventEnd), 500);
        }
        async EventMiddlewareEmitter(data, method) {
            const requestId = this.GenerateEventInternalId(data, method);
            const streamName = `${this.streamName}`;
            let state = await this.processStateChecker(requestId);
            if (state === "processing") {
                return await this.eventCompletedHandler(streamName, requestId);
            }
            else if (state) {
                return { payload: state, requestId };
            }
            else {
                const template = this.template(method, data, {
                    $correlationId: requestId,
                    state: 'processing',
                    $causationId: this.streamName,
                    causationRoute: this.causationRoute
                });
                const event = await this.appendToStream(streamName, template);
                if (event) {
                    state = await this.eventCompletedHandler(streamName, requestId);
                }
            }
            return { payload: state, requestId };
        }
        async appendToStream(streamName, template) {
            return await this.client.appendToStream(streamName, [template])
                .catch((err) => {
                console.log('Error EventsPlugin.add', err);
                new Error('Error system : ' + err);
            });
        }
        async eventCompletedHandler(streamName, EventId) {
            let data = null;
            const stream = this.client.subscribeToStream(streamName, {
                fromRevision: this.StartRevision,
                resolveLinkTos: true,
            });
            // @ts-ignore
            for await (const resolvedEvent of stream) {
                const { event } = resolvedEvent;
                if (event && event.metadata?.$correlationId === EventId
                    && (event.metadata?.state === 'completed' || event.metadata?.state === 'error')) {
                    data = event.data;
                    this.StartRevision = BigInt(event.revision) > BigInt(100n) ? BigInt(event.revision - 100n) : this.StartRevision;
                    break;
                }
            }
            await stream.unsubscribe();
            return data;
        }
        getMainStream() {
            try {
                const subscription = this.client.readStream(this.streamName, this.readStreamConfig(this.credentials));
                return subscription;
            }
            catch (error) {
                console.error(error);
            }
            return null;
        }
        getStreamCorrelation(correlationId) {
            try {
                const subscription = this.client.readStream(`$bc-${correlationId}`, this.readStreamConfig(this.credentials));
                return subscription;
            }
            catch (error) {
                console.error(error);
            }
            return this.getMainStream();
        }
        async processStateChecker(EventId) {
            let data = null;
            try {
                const subscription = this.getMainStream();
                if (subscription) {
                    for await (const resolvedEvent of subscription) {
                        const event = resolvedEvent.event;
                        if (event && event.metadata?.$correlationId === EventId) {
                            switch (event.metadata?.state) {
                                // In case of delivered we allow user to renew the entry
                                case 'delivered':
                                    subscription.destroy();
                                    return null;
                                // In case of complete we send the last information to the user
                                case 'completed':
                                    subscription.destroy();
                                    return event.data;
                                // In case of processing we transparency send the user to the pending room
                                case 'processing':
                                    subscription.destroy();
                                    return event.metadata?.state;
                                case 'error':
                                    subscription.destroy();
                                    return event.data;
                            }
                        }
                    }
                }
            }
            catch (err) {
                console.error('Error EventsPlugin.processStateChecker', err);
            }
            return data;
        }
        async init() {
            const streamName = `${this.streamName}`;
            const exist = await _EventCollection.findOne({ StreamName: streamName }).lean();
            this.StartRevision = global_1.END;
            if (!exist) {
                console.log('Stream Does not exist');
                /*await this.appendToStream(streamName, this.template('init', {init: true},
                    {state: 'stalled'}))*/
            }
        }
        template(type, data, metadata) {
            return (0, global_1.jsonEvent)({
                type,
                data,
                metadata
            });
        }
        GenerateEventInternalId(data, method) {
            return (0, global_1.md5)(JSON.stringify({ payload: data, method }));
        }
    };
};
exports.default = EventsPlugin;
