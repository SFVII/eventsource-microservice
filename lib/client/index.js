"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addContributor = void 0;
const global_1 = require("../core/global");
const CommonResponse_1 = require("../core/CommonResponse");
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
const QueueLimitRetry = 10;
class DataTreated {
    constructor() {
        this.list = [];
        this.clear_process = false;
        this.clearOldFile();
    }
    exist(IdEvent) {
        return this.list.findIndex((doc) => doc.id === IdEvent) > -1;
    }
    async add(entry) {
        if (this.clear_process) {
            await this.sleep(200);
            await this.add(entry);
        }
        else {
            const index = this.list.findIndex((doc) => entry.id == doc.id);
            if (index > -1)
                this.list[index] = entry;
            else
                this.list.unshift(entry);
        }
    }
    async find(IdEvent, retry = 0) {
        if (retry && retry > QueueLimitRetry)
            return false;
        if (!this.list.length) {
            await this.sleep(200);
            return this.find(IdEvent, ++retry);
        }
        else {
            const lookup = this.list.find((doc) => doc.id === IdEvent);
            if (lookup && lookup.event === 'pending' || !lookup) {
                await this.sleep(200);
                return this.find(IdEvent, ++retry);
            }
            else
                return lookup.event;
        }
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(() => resolve(true), ms));
    }
    clearOldFile() {
        setInterval(() => {
            this.clear_process = true;
            const limit = new Date();
            limit.setMinutes(limit.getMinutes() - 1);
            this.list = this.list.filter((doc) => doc.date.getTime() >= limit.getTime()) || [];
            this.clear_process = false;
        }, 1000 * 60);
    }
}
class EventsPlugin extends DataTreated {
    constructor(EvenStoreConfig, streamName, methods, causationRoute) {
        super();
        this.group = 'client-';
        this.methods = methods;
        this.streamName = streamName;
        this.group += streamName;
        this.client = new global_1.EventStoreDBClient(EvenStoreConfig.connexion, EvenStoreConfig.security, EvenStoreConfig.credentials);
        this.credentials = EvenStoreConfig.credentials;
        this.causationRoute = causationRoute;
        this.InitStreamWatcher().catch((err) => {
            console.log('ERROR InitStreamWatcher', err);
            process.exit(0);
        });
        for (const method of this.methods) {
            // @ts-ignore
            this[method] = async (data, contributor, typeOrigin) => {
                const { payload, requestId, error, } = await this.EventMiddlewareEmitter(data, method, typeOrigin, contributor)
                    // @ts-ignore
                    .catch((err) => {
                    return {
                        payload: null,
                        error: err.payload,
                        requestId: err.request_id
                    };
                });
                return {
                    data: payload,
                    request_id: requestId,
                    error,
                    ack: () => {
                    }
                };
            };
        }
    }
    async InitStreamWatcher() {
        try {
            await this.CreatePersistentSubscription(this.streamName);
            this.stream = this.SubscribeToPersistent(this.streamName);
            for await (const resolvedEvent of this.stream) {
                const event = resolvedEvent.event;
                const eventParse = new CommonResponse_1.EventParser(resolvedEvent);
                const state = this.eventState(eventParse.state);
                if (state === true)
                    await this.add({
                        id: eventParse.correlationId,
                        event: { ...event, data: eventParse.data },
                        date: new Date()
                    });
                this.stream.ack(resolvedEvent);
            }
        }
        catch (err) {
            console.log('Stream crashed restart pod', err);
            process.exit(0);
        }
    }
    SubscribeToPersistent(streamName) {
        return this.client.subscribeToPersistentSubscription(streamName, this.group);
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
                return true;
            }
            else
                console.error('Error EventHandler.CreatePersistentSubscription', err);
            return false;
        }
    }
    EventMiddlewareEmitter(data, method, typeOrigin, contributor) {
        return new Promise(async (resolve, reject) => {
            const requestId = this.GenerateEventInternalId(data, method);
            const streamName = this.streamName;
            if (this.exist(requestId)) {
                const event = await this.find(requestId);
                if (event && event.data) {
                    return resolve({
                        payload: event?.data,
                        requestId
                    });
                }
            }
            const eventParser = new CommonResponse_1.EventParser({
                type: typeOrigin ? typeOrigin : method,
                event: {
                    data,
                    metadata: {
                        $correlationId: requestId,
                        state: 'processing',
                        $causationId: this.streamName,
                        causationRoute: [...this.causationRoute],
                        typeOrigin: typeOrigin ? typeOrigin : method,
                        contributor: (0, exports.addContributor)(contributor)
                    }
                }
            });
            const template = this.template(method, eventParser.data, eventParser.buildMetadata);
            // this.add({id: requestId, event: 'pending', date: new Date()});
            await this.appendToStream(streamName, template);
            const event = await this.find(requestId, 0);
            if (event)
                resolve({ payload: event.data, requestId });
            else {
                reject({ payload: { error: 'Error on pending items create' }, request_id: requestId });
            }
        });
    }
    async appendToStream(streamName, template) {
        return this.client.appendToStream(streamName || this.streamName, [template])
            .catch((err) => {
            console.log('Error EventsPlugin.add', err);
        });
    }
    eventState(state) {
        switch (state) {
            // In case of delivered we allow user to renew the entry
            // In case of complete we send the last information to the user
            //  case 'delivered':
            // case 'delivered':
            case 'error':
            case 'completed':
                return true;
            // In case of processing we transparency send the user to the pending room
            // case 'processing':
            //    return null
            default:
                return false;
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
        return (0, global_1.md5)(JSON.stringify({ payload: data, method, company: 'nowla' }));
    }
}
exports.default = EventsPlugin;
