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
const db_client_1 = require("@eventstore/db-client");
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
/**
 *
 */
class DataTreated {
    constructor() {
        this.QueueLimitRetry = 100;
        this.IntervalClear = 15;
        this.list = [];
        this._minutes = 1000;
        this.clear_process = false;
        setTimeout(() => this.clearOldFile(), 10000);
    }
    get clearTime() {
        return this.IntervalClear * this._minutes;
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
    async find(IdEvent, catchStreamResult = null, specificQuery, retry = 0) {
        if (retry && retry > this.QueueLimitRetry)
            return false;
        if (!this.list.length) {
            await this.sleep(this.clearTime / this.QueueLimitRetry);
            return this.find(IdEvent, catchStreamResult, specificQuery, ++retry);
        }
        else {
            //console.log('AYOOOO event : %s, catchstreamresult %s === %s', IdEvent, catchStreamResult)
            const lookup = this.list.find((doc) => {
                if (catchStreamResult) {
                    if (specificQuery && typeof specificQuery === 'object') {
                        // @ts-ignore
                        console.log('specificQuery', specificQuery, doc, doc.event, doc.event?.data);
                        if (doc.causation === catchStreamResult && typeof doc.event === 'object') {
                            for (const x in specificQuery) {
                                // @ts-ignore
                                if (!(doc.event?.data && doc.event.data[x]))
                                    return false;
                            }
                            return true;
                        }
                        else
                            return false;
                    }
                    else {
                        return (catchStreamResult === doc.causation && doc.id === IdEvent);
                    }
                    //console.log('Catch stream', catchStreamResult, catchStreamResult === doc.causation && doc.id === IdEvent)
                }
                else {
                    return doc.id === IdEvent;
                }
            });
            if (lookup && lookup.event === 'pending' || !lookup) {
                await this.sleep(200);
                return this.find(IdEvent, catchStreamResult, specificQuery, ++retry);
            }
            return lookup.event;
        }
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(() => resolve(true), ms));
    }
    clearOldFile() {
        console.log('Clearing time is set to %d ms ', this.clearTime);
        setInterval(() => {
            console.log('start clear');
            this.clear_process = true;
            const limit = new Date();
            limit.setMinutes(limit.getMinutes() - this.IntervalClear);
            this.list = this.list.filter((doc) => doc.date.getTime() >= limit.getTime()) || [];
            this.clear_process = false;
        }, this.clearTime);
    }
}
class EventsPlugin extends DataTreated {
    constructor(EvenStoreConfig, streamName, methods, causationRoute) {
        super();
        this._pendingTemplates = {};
        this.group = 'client-';
        this.methods = methods;
        this.streamName = streamName;
        this._pendingTemplates[streamName] = [];
        this.group += streamName;
        this.client = new global_1.EventStoreDBClient(EvenStoreConfig.connexion, EvenStoreConfig.security, EvenStoreConfig.credentials);
        this.credentials = EvenStoreConfig.credentials;
        this.causationRoute = causationRoute;
        for (const method of this.methods) {
            // @ts-ignore
            this[method] = async (data, contributor, typeOrigin, catchStreamResult, specificQuery) => {
                const { payload, requestId, error } = await this.EventMiddlewareEmitter(data, method, typeOrigin, contributor, catchStreamResult, specificQuery)
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
        console.log('INIT STREAM');
        this.InitStreamWatcher().catch((err) => {
            console.log('ERROR InitStreamWatcher', err);
            process.exit(0);
        });
        this.initAppendToStream();
    }
    async InitStreamWatcher() {
        const state = await this.CreatePersistentSubscription(this.streamName);
        this.stream = await this.SubscribeToPersistent(this.streamName);
        if (this.stream) {
            for await (const resolvedEvent of this.stream) {
                try {
                    const event = resolvedEvent.event;
                    const eventParse = new CommonResponse_1.EventParser(resolvedEvent);
                    const state = this.eventState(eventParse.state);
                    if (state)
                        await this.add({
                            id: eventParse.correlationId,
                            event: { ...event, data: eventParse.data },
                            date: new Date(),
                            causation: eventParse.metadata.consumer_job_name
                        }).catch((err) => console.log('Add to cache queue error', err));
                    this.stream.ack(resolvedEvent);
                }
                catch (err) {
                    console.log('Event goes to parking');
                    this.stream.nack(resolvedEvent, db_client_1.PARK);
                }
            }
        }
        else {
            console.log('This stream doesn not exist');
            console.log('restart...');
            process.exit(0);
        }
    }
    SubscribeToPersistent(streamName) {
        try {
            const x = this.client.subscribeToPersistentSubscriptionToStream(streamName, this.group);
            return x;
        }
        catch (err) {
            console.log('--------SubscribeToPersistent----------->', err);
            return null;
        }
    }
    async CreatePersistentSubscription(streamName) {
        console.log('Create Persistent Configuration', streamName, this.group, this.credentials);
        try {
            await this.client.createPersistentSubscriptionToStream(streamName, this.group, (0, db_client_1.persistentSubscriptionToStreamSettingsFromDefaults)({ startFrom: db_client_1.END }), { credentials: this.credentials });
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
    EventMiddlewareEmitter(data, method, typeOrigin, contributor, catchStreamResult, specificQuery) {
        return new Promise(async (resolve, reject) => {
            const requestId = this.GenerateEventInternalId(data, method);
            const streamName = this.streamName;
            if (this.exist(requestId)) {
                const event = await this.find(requestId, catchStreamResult, specificQuery);
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
                        contributor: (0, exports.addContributor)(contributor),
                        consumer_job_name: null
                    }
                }
            });
            const template = this.template(method, eventParser.data, eventParser.buildMetadata);
            // this.add({id: requestId, event: 'pending', date: new Date()});
            this.appendToStream(streamName, template);
            const event = await this.find(requestId, catchStreamResult, specificQuery, 0);
            if (event)
                resolve({ payload: event.data, requestId });
            else {
                reject({ payload: { error: 'Error on pending items create' }, request_id: requestId });
            }
        });
    }
    initAppendToStream() {
        setInterval(() => {
            Object.keys(this._pendingTemplates).forEach((streamName) => {
                if (this._pendingTemplates[streamName].length) {
                    const current_queue = this._pendingTemplates[streamName].length;
                    const current_selection = this._pendingTemplates[streamName]
                        .splice(0, this._pendingTemplates[streamName].length >= 50 ? 50 : this._pendingTemplates[streamName].length);
                    console.log('%s - sending %d of current list of %d and left %d', streamName, current_selection.length, current_queue, this._pendingTemplates[streamName].length);
                    this.client.appendToStream(streamName || this.streamName, current_selection)
                        .catch((err) => {
                        console.log('Error EventsPlugin.add', err);
                    });
                }
            });
        }, 100);
    }
    appendToStream(streamName, template) {
        if (!this._pendingTemplates[streamName])
            this._pendingTemplates[streamName] = [template];
        else
            this._pendingTemplates[streamName].push(template);
        /* this.client.appendToStream(streamName || this.streamName,
             [template])
             .catch((err) => {
                 console.log('Error EventsPlugin.add', err)
             })*/
    }
    eventState(state) {
        switch (state) {
            // In case of delivered we allow user to renew the entry
            // In case of complete we send the last information to the user
            //  case 'delivered':
            case 'delivered':
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
