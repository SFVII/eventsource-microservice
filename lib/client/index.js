"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addContributor = void 0;
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
class DataTreated {
    constructor() {
        this.list = [];
        this.clearOldFile();
    }
    exist(IdEvent) {
        return this.list.findIndex((doc) => doc.id === IdEvent) > -1;
    }
    add(entry) {
        const index = this.list.findIndex((doc) => entry.id == doc.id);
        if (index > -1)
            this.list[index] = entry;
        else
            this.list.push(entry);
    }
    async find(IdEvent, retry = 0) {
        if (retry <= 30) {
            const lookup = this.list.find((doc) => doc.id === IdEvent);
            if (lookup && lookup.event === 'pending') {
                await this.sleep(100);
                return this.find(IdEvent, retry++);
            }
            else if (lookup)
                return lookup.event;
        }
        else
            return false;
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(() => resolve(true), ms));
    }
    clearOldFile() {
        setInterval(() => {
            const limit = new Date();
            limit.setMinutes(limit.getMinutes() - 1);
            this.list = this.list.filter((doc) => doc.date.getTime() >= limit.getTime());
        }, 1000 * 60);
    }
}
class EventsPlugin extends DataTreated {
    constructor(EvenStoreConfig, streamName, methods, causationRoute) {
        super();
        this.group = 'client-';
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
            this[method] = async (data, contributor, typeOrigin
            // this.create({...}, {id: xxxx}, event.typeOrigin)
            ) => {
                const _streamName = streamName;
                const { payload, requestId } = await this.EventMiddlewareEmitter(data, method, _streamName, typeOrigin, contributor);
                return {
                    data: payload,
                    ack: this.delivered(requestId, method, payload, typeOrigin, _streamName, contributor, [_streamName])
                        .bind(this)
                };
            };
        }
    }
    async InitStreamWatcher() {
        await this.CreatePersistentSubscription(this.streamName);
        this.stream = this.SubscribeToPersistent(this.streamName);
        for await (const resolvedEvent of this.stream) {
            const event = resolvedEvent.event;
            if (event.metadata.state !== 'delivered') {
                const state = this.eventState(event.metadata.state);
                if (state === true) {
                    this.add({ id: event.metadata['$correlationId'], event, date: new Date });
                }
                else if (state === null) {
                    this.add({ id: event.metadata['$correlationId'], event: 'pending', date: new Date });
                }
            }
            console.log('-----resolved event', resolvedEvent);
            this.stream.ack(resolvedEvent);
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
                console.log('Persistent subscription %s already exist', streamName);
                return true;
            }
            else
                console.error('Error EventHandler.CreatePersistentSubscription', err);
            return false;
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
            if (this.exist(requestId)) {
                console.log('Event exist try to call return it');
                const event = await this.find(requestId);
                console.log('Event found');
                if (event)
                    resolve({ payload: event.data, requestId });
                else {
                    console.log('Error on pending items', { payload: event, requestId });
                    resolve({ payload: event, requestId });
                }
            }
            else {
                const template = this.template(method, data, {
                    $correlationId: requestId,
                    state: 'processing',
                    $causationId: this.streamName,
                    causationRoute: this.causationRoute,
                    typeOrigin: typeOrigin ? typeOrigin : method,
                    contributor: (0, exports.addContributor)(contributor)
                });
                await this.appendToStream(streamName, template);
                const event = await this.find(requestId);
                if (event)
                    resolve({ payload: event.data, requestId });
                else {
                    console.log('Error on pending items create', { payload: event, requestId });
                    resolve({ payload: event, requestId });
                }
            }
            /*  let state: { data: any; state: any } | boolean = await this.exist(requestId);
              console.log('my stream name', streamName, state)
              if (state && state.state === "processing") {
                  console.log('------------- processing')
                  const state = await this.eventCompletedHandler(streamName, requestId);
                  resolve({payload: state.data, requestId})
              } else if (state && state?.data) {
                  console.log('------------- state')
                  resolve({payload: state.data, requestId});
              } else {
                  console.log('------------- else')
                  const template = this.template(method, data, {
                      $correlationId: requestId,
                      state: 'processing',
                      $causationId: this.streamName,
                      causationRoute: this.causationRoute,
                      typeOrigin: typeOrigin ? typeOrigin : method,
                      contributor: addContributor(contributor)
                  })
                  let state: { data: any; state: any } | boolean = await this.eventCompletedHandler(streamName, requestId,
                      () => (this.appendToStream(streamName, template)));
                  resolve({payload: state, requestId});
              }*/
        });
    }
    async appendToStream(streamName, template) {
        return this.client.appendToStream(streamName || this.streamName, [template])
            .catch((err) => {
            console.log('Error EventsPlugin.add', err);
        });
    }
    async _eventCompletedGlobalHandler(streamName) {
        const stream = this.client.subscribeToStream(streamName, {
            fromRevision: global_1.END,
            resolveLinkTos: true,
        });
        return async (EventId, callback) => {
            if (callback)
                await callback();
            for await (const resolvedEvent of stream) {
                const { event } = resolvedEvent;
                if (event && event.metadata?.$correlationId === EventId
                    && (event.metadata?.state === 'completed' || event.metadata?.state === 'error')) {
                    console.log("J'existe !!!!", event.data);
                    return event.data;
                }
            }
            return null;
        };
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
    eventState(event) {
        switch (event.metadata?.state) {
            // In case of delivered we allow user to renew the entry
            // In case of complete we send the last information to the user
            //  case 'delivered':
            case 'delivered':
            case 'error':
            case 'completed':
                return true;
            // In case of processing we transparency send the user to the pending room
            case 'processing':
                return null;
            default:
                return false;
        }
    }
    async processStateChecker(EventId) {
        let data = {};
        const subscription = this.getMainStream();
        if (subscription) {
            try {
                for await (const resolvedEvent of subscription) {
                    const event = resolvedEvent.event;
                    /*  if (event && event.metadata?.$correlationId !== EventId && event.metadata?.state === "delivered") {
                          console.log('Last checkpoint', event)
                          return false;
                      } else */
                    if (event && event.metadata?.$correlationId === EventId)
                        return this.eventState(event);
                }
            }
            catch (err) {
                console.error('Error EventsPlugin.processStateChecker', err);
            }
            subscription.destroy();
        }
        return false;
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
