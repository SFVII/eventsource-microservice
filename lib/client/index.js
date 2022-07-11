"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addContributor = void 0;
/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 09/02/2022
 **  @Description
 ***********************************************************/
const global_1 = require("../core/global");
const addContributor = (contributor = {
    lastname: 'system',
    firstname: 'system'
}) => {
    return {
        ...contributor,
        account: typeof contributor?.account !== "string" ? contributor?.account?._id : contributor?.account,
        group: typeof contributor?.group !== "string" ? contributor?.group?._id : contributor?.group
    };
};
exports.addContributor = addContributor;
class EventsPlugin {
    constructor(EvenStoreConfig, streamName, methods, causationRoute) {
        this.readStreamConfig = (credentials) => {
            return {
                direction: global_1.BACKWARDS,
                fromRevision: global_1.END,
                maxCount: 50,
                credentials: credentials
            };
        };
        this.methods = methods;
        this.streamName = streamName;
        this.client = new global_1.EventStoreDBClient(EvenStoreConfig.connexion, EvenStoreConfig.security, EvenStoreConfig.credentials);
        this.credentials = EvenStoreConfig.credentials;
        this.causationRoute = causationRoute;
        for (const method of this.methods) {
            // @ts-ignore
            this[method] = async (data, contributor, typeOrigin
            // this.create({...}, {id: xxxx}, event.typeOrigin)
            ) => {
                const _streamName = streamName;
                const { payload, requestId } = await this.EventMiddlewareEmitter(data, method, _streamName, typeOrigin, contributor);
                return {
                    data: payload,
                    ack: this.delivered(requestId, method, payload, typeOrigin, _streamName, contributor, _streamName)
                        .bind(this)
                };
            };
        }
    }
    delivered(requestId, method, payload, typeOrigin, streamName, contributor, causationRoute) {
        console.log('Delivered', requestId, method, payload, typeOrigin, streamName, contributor, causationRoute);
        const eventEnd = this.template(method, payload, {
            $correlationId: requestId,
            state: 'delivered',
            $causationId: streamName,
            causationRoute: causationRoute,
            typeOrigin: typeOrigin,
            contributor: (0, exports.addContributor)(contributor)
        });
        console.log('ICI -> ', {
            $correlationId: requestId,
            state: 'delivered',
            $causationId: streamName,
            causationRoute: causationRoute,
            typeOrigin: typeOrigin,
            contributor: (0, exports.addContributor)(contributor)
        }, eventEnd);
        const appendToStream = this.appendToStream.bind(this);
        console.log('appendToStream', appendToStream);
        return () => {
            console.log('OK ????');
            appendToStream(streamName, eventEnd);
            return true;
        };
    }
    EventMiddlewareEmitter(data, method, _streamName, typeOrigin, contributor) {
        return new Promise(async (resolve) => {
            const requestId = this.GenerateEventInternalId(data, method);
            const streamName = _streamName ? _streamName : this.streamName;
            let state = await this.processStateChecker(requestId);
            console.log('my stream name', streamName, state);
            if (state === "processing") {
                console.log('------------- processing');
                const state = await this.eventCompletedHandler(streamName, requestId);
                resolve({ payload: state, requestId });
            }
            else if (state) {
                console.log('------------- state');
                resolve({ payload: state, requestId });
            }
            else {
                console.log('------------- else');
                const template = this.template(method, data, {
                    $correlationId: requestId,
                    state: 'processing',
                    $causationId: this.streamName,
                    causationRoute: this.causationRoute,
                    typeOrigin: typeOrigin ? typeOrigin : method,
                    contributor: (0, exports.addContributor)(contributor)
                });
                state = await this.eventCompletedHandler(streamName, requestId, () => (this.appendToStream(streamName, template)));
                resolve({ payload: state, requestId });
            }
        });
    }
    async appendToStream(streamName, template) {
        return this.client.appendToStream(streamName || this.streamName, [template])
            .catch((err) => {
            console.log('Error EventsPlugin.add', err);
        });
    }
    async eventCompletedHandler(streamName, EventId, callback) {
        let data = null;
        const stream = this.client.subscribeToStream(streamName, {
            fromRevision: global_1.END,
            resolveLinkTos: true,
        });
        if (callback)
            await callback();
        // @ts-ignore
        for await (const resolvedEvent of stream) {
            const { event } = resolvedEvent;
            if (event && event.metadata?.$correlationId === EventId
                && (event.metadata?.state === 'completed' || event.metadata?.state === 'error')) {
                data = event.data;
                console.log("J'existe !!!!", data);
                /*this.StartRevision = BigInt(event.revision) > BigInt(100n)
                    ? BigInt(event.revision - 100n) : this.StartRevision;*/
                break;
            }
        }
        await stream.unsubscribe();
        console.log('--------', data);
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
    async processStateChecker(EventId) {
        let data = null;
        try {
            const subscription = this.getMainStream();
            if (subscription) {
                for await (const resolvedEvent of subscription) {
                    const event = resolvedEvent.event;
                    if (event && event.metadata?.$correlationId !== EventId && event.metadata?.state === "delivered") {
                        console.log('Last checkpoint', event);
                        return true;
                    }
                    else if (event && event.metadata?.$correlationId === EventId) {
                        switch (event.metadata?.state) {
                            // In case of delivered we allow user to renew the entry
                            // In case of complete we send the last information to the user
                            case 'error':
                            case 'delivered':
                            case 'completed':
                                subscription.destroy();
                                return event.data;
                            // In case of processing we transparency send the user to the pending room
                            case 'processing':
                                subscription.destroy();
                                return event.metadata?.state;
                            default:
                                subscription.destroy();
                                return true;
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
    template(type, data, metadata) {
        return (0, global_1.jsonEvent)({
            type,
            data,
            metadata
        });
    }
    GenerateEventInternalId(data, method) {
        return (0, global_1.md5)(JSON.stringify({ payload: data, method, company: 'nowla' }));
    }
}
exports.default = EventsPlugin;
