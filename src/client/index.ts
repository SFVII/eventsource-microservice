/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 09/02/2022
 **  @Description
 ***********************************************************/
import {EventType, ResolvedEvent, StreamingRead} from "@eventstore/db-client";
import {
    BACKWARDS,
    END,
    EventData,
    EventStoreDBClient,
    IEvenStoreConfig,
    IReadStreamConfig,
    ITemplateEvent,
    jsonEvent,
    md5,
    persistentSubscriptionSettingsFromDefaults,
    START
} from "../core/global";

export interface IMethodFunctionResponse {
    data: any,
    ack: () => (requestId: string,
                method: string,
                payload: any,
                streamName: string,
                causationRoute: string[]) => void
}

export type IMethodFunction<DataModel, Type> = (
    data: ModelEventWrapper<DataModel> | ModelEventWrapper<DataModel>[],
    contributor?: IContributor,
    typeOrigin?: 'create' | 'update' | 'delete' | 'recover' | Type,
    streamName?: string,
    causationRoute?: string[])
    => Promise<IMethodFunctionResponse>


export type IContributor = {
    id_contact?: string,
    id_nowteam?: string,
    id_external?: string,
    lastname?: string,
    firstname?: string,
    account?: string | Partial<any> & { _id: string },
    group?: string | Partial<any> & { _id: string }
}


export type ModelEventWrapper<DataModel> = {
    model?: {
        fs?: string | undefined,
        db?: string | undefined,
        sf?: string | undefined,
        [key: string]: string | undefined
    },
    i18n?: { model?: string, language: string, fields: string[], shouldRenderJson?: boolean }
    origins?: [string, string][]
    value: DataModel | DataModel[]
    fields?: (keyof DataModel)[]
}


export const addContributor = (contributor: IContributor = {
    lastname: 'system',
    firstname: 'system'
}) => {

    return {
        ...contributor,
        account: typeof contributor?.account !== "string" ? contributor?.account?._id : contributor?.account,
        group: typeof contributor?.group !== "string" ? contributor?.group?._id : contributor?.group
    }
}

type IDataTreatedList = { id: string, event: EventType | 'pending', date: Date }
type IDataTreatedListFoundResult = EventType | false | undefined

class DataTreated {
    protected list: IDataTreatedList[] = [];

    constructor() {
        this.clearOldFile();
    }

    public exist(IdEvent: string) {
        return this.list.findIndex((doc: IDataTreatedList) => doc.id === IdEvent) > -1;
    }

    public add(entry: IDataTreatedList) {
        const index = this.list.findIndex((doc: IDataTreatedList) => entry.id == doc.id)
        if (index > -1) this.list[index] = entry;
        else this.list.push(entry);
    }


    async find(IdEvent: string, retry: number = 0): Promise<IDataTreatedListFoundResult> {
        if (retry <= 30) {
            const lookup = this.list.find((doc: IDataTreatedList) => doc.id === IdEvent);
            if (lookup && lookup.event === 'pending') {
                await this.sleep(100);
                return this.find(IdEvent, retry++);
            } else if (lookup) return lookup.event as EventType;
        } else return false;
    }

    sleep(ms: number) {
        return new Promise((resolve) => setTimeout(() => resolve(true), ms));
    }

    clearOldFile() {
        setInterval(() => {
            const limit = new Date();
            limit.setMinutes(limit.getMinutes() - 1)
            this.list = this.list.filter((doc: IDataTreatedList) => doc.date.getTime() >= limit.getTime());
        }, 1000 * 60);
    }
}

class EventsPlugin<DataModel> extends DataTreated {

    public create: IMethodFunction<DataModel, 'create'>;
    public update: IMethodFunction<DataModel, 'update'>;
    public delete: IMethodFunction<DataModel, 'delete'>;
    public recover: IMethodFunction<DataModel, 'recover'>;

    protected methods: string[];
    protected streamName: string;
    protected client: EventStoreDBClient;
    protected credentials: IEvenStoreConfig["credentials"];
    private readonly causationRoute: string[];
    private stream: any;
    private group: string = 'client-';

    constructor(EvenStoreConfig: IEvenStoreConfig,
                streamName: string,
                methods: string[],
                causationRoute: string[]) {
        super()
        this.methods = methods;
        this.streamName = streamName;
        this.group += streamName
        this.client = new EventStoreDBClient(
            EvenStoreConfig.connexion,
            EvenStoreConfig.security,
            EvenStoreConfig.credentials);
        this.credentials = EvenStoreConfig.credentials;
        this.causationRoute = causationRoute;
        this.InitStreamWatcher().catch((err: any) => {

            console.log('ERROR InitStreamWatcher', err)
            process.exit(0)
        })
        for (const method of this.methods) {
            // @ts-ignore
            this[method] = async (data: ModelEventWrapper<DataModel> | ModelEventWrapper<DataModel>[],
                                  contributor?: IContributor,
                                  typeOrigin?: 'create' | 'update' | 'delete' | 'recover' | string
                                  // this.create({...}, {id: xxxx}, event.typeOrigin)
            ): Promise<{
                data: ModelEventWrapper<DataModel> | ModelEventWrapper<DataModel[]>,
                ack: () => void
            }> => {
                const _streamName = streamName
                const {
                    payload,
                    requestId
                } = await this.EventMiddlewareEmitter(data, method, _streamName, typeOrigin, contributor)
                return {
                    data: payload,
                    ack: this.delivered(
                        requestId,
                        method,
                        payload,
                        typeOrigin,
                        _streamName,
                        contributor,
                        _streamName)
                        .bind(this)
                };
            }
        }
    }


    private async InitStreamWatcher() {
        await this.CreatePersistentSubscription(this.streamName);
        this.stream = this.SubscribeToPersistent(this.streamName);
        for await (const resolvedEvent of this.stream) {
            const event: any = resolvedEvent.event;
            if (event.metadata.state !== 'delivered') {
                const state: false | null | true = this.eventState(event.metadata.state)
                if (state === true) {
                    this.add({id: event.metadata['$correlationId'], event, date: new Date});
                } else if (state === null) {
                    this.add({id: event.metadata['$correlationId'], event: 'pending', date: new Date});
                }
            }
            console.log('-----resolved event', resolvedEvent);
            this.stream.ack(resolvedEvent);
        }
    }

    private SubscribeToPersistent(streamName: string) {
        return this.client.subscribeToPersistentSubscription(
            streamName,
            this.group
        )
    }

    private async CreatePersistentSubscription(streamName: string): Promise<boolean> {
        try {
            await this.client.createPersistentSubscription(
                streamName,
                this.group,
                persistentSubscriptionSettingsFromDefaults({
                    startFrom: START,
                    resolveLinkTos: true
                }),
                {credentials: this.credentials}
            )
            return true;
        } catch (err) {
            const error = (err ? err.toString() : "").toLowerCase();
            if (error.includes('EXIST') || error.includes('exist')) {
                console.log('Persistent subscription %s already exist', streamName)
                return true;
            } else console.error('Error EventHandler.CreatePersistentSubscription', err);
            return false;
        }
    }

    private delivered(requestId: string,
                      method: string,
                      payload: any,
                      typeOrigin: any,
                      streamName: string | undefined,
                      contributor: IContributor | undefined,
                      causationRoute: string | undefined) {
        console.log('Delivered', requestId, method, payload, typeOrigin, streamName, contributor, causationRoute)
        const eventEnd = this.template(method, payload, {
            $correlationId: requestId,
            state: 'delivered',
            $causationId: streamName,
            causationRoute: causationRoute,
            typeOrigin: typeOrigin,
            contributor: addContributor(contributor)
        })
        console.log('ICI -> ', {
            $correlationId: requestId,
            state: 'delivered',
            $causationId: streamName,
            causationRoute: causationRoute,
            typeOrigin: typeOrigin,
            contributor: addContributor(contributor)
        }, eventEnd);

        const appendToStream = this.appendToStream.bind(this);
        console.log('appendToStream', appendToStream)
        return () => {
            console.log('OK ????')
            appendToStream(streamName, eventEnd);
            return true;
        }
    }

    private EventMiddlewareEmitter(data: ModelEventWrapper<DataModel> | ModelEventWrapper<DataModel>[],
                                   method: string,
                                   _streamName?: string,
                                   typeOrigin?: string,
                                   contributor?: IContributor): Promise<{ payload: any, requestId: string, }> {

        return new Promise(async (resolve) => {
            const requestId = this.GenerateEventInternalId(data, method);
            const streamName = _streamName ? _streamName : this.streamName
            if (this.exist(requestId)) {
                console.log('Event exist try to call return it')
                const event: IDataTreatedListFoundResult = await this.find(requestId);
                console.log('Event found');
                if (event) resolve({payload: event.data, requestId});
                else {
                    console.log('Error on pending items', {payload: event, requestId})
                    resolve({payload: event, requestId})
                }
            } else {
                const template = this.template(method, data, {
                    $correlationId: requestId,
                    state: 'processing',
                    $causationId: this.streamName,
                    causationRoute: this.causationRoute,
                    typeOrigin: typeOrigin ? typeOrigin : method,
                    contributor: addContributor(contributor)
                })
                await this.appendToStream(streamName, template)
                const event: IDataTreatedListFoundResult = await this.find(requestId);
                if (event) resolve({payload: event.data, requestId});
                else {
                    console.log('Error on pending items create', {payload: event, requestId})
                    resolve({payload: event, requestId})
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
        })
    }

    private async appendToStream(streamName: string, template: EventData) {
        return this.client.appendToStream(streamName || this.streamName,
            [template])
            .catch((err) => {
                console.log('Error EventsPlugin.add', err)
            })
    }


    private async _eventCompletedGlobalHandler(streamName: string) {
        const stream = this.client.subscribeToStream(streamName, {
            fromRevision: END,
            resolveLinkTos: true,
        })

        return async (EventId: string, callback?: () => void) => {
            if (callback) await callback();
            for await (const resolvedEvent of stream) {
                const {event}: any = resolvedEvent;
                if (event && event.metadata?.$correlationId === EventId
                    && (event.metadata?.state === 'completed' || event.metadata?.state === 'error')) {
                    console.log("J'existe !!!!", event.data)
                    return event.data;
                }
            }
            return null;
        }

    }

    private async eventCompletedHandler(streamName: string, EventId: string, callback?: () => void) {
        let data = null;
        const stream = this.client.subscribeToStream(streamName, {
            fromRevision: END,
            resolveLinkTos: true,
        })
        if (callback) await callback();
        // @ts-ignore
        for await (const resolvedEvent of stream) {
            const {event}: any = resolvedEvent;
            if (event && event.metadata?.$correlationId === EventId
                && (event.metadata?.state === 'completed' || event.metadata?.state === 'error')) {
                data = event.data;
                console.log("J'existe !!!!", data)
                /*this.StartRevision = BigInt(event.revision) > BigInt(100n)
                    ? BigInt(event.revision - 100n) : this.StartRevision;*/
                break;
            }
        }
        await stream.unsubscribe();
        console.log('--------', data);
        return data;
    }

    private readStreamConfig = (credentials: IEvenStoreConfig["credentials"]): IReadStreamConfig => {
        return {
            direction: BACKWARDS,
            fromRevision: END,
            maxCount: 50,
            credentials: credentials
        }
    }

    private getMainStream() {
        try {
            const subscription = this.client.readStream(
                this.streamName,
                this.readStreamConfig(this.credentials));
            return subscription;
        } catch (error) {
            console.error(error)
        }
        return null;
    }

    private eventState(event: any) {
        switch (event.metadata?.state) {
            // In case of delivered we allow user to renew the entry
            // In case of complete we send the last information to the user
            //  case 'delivered':
            case 'delivered':
            case 'error':
            case 'completed':
                return true
            // In case of processing we transparency send the user to the pending room
            case 'processing':
                return null
            default:
                return false;
        }
    }

    private async processStateChecker(EventId: string) {
        let data: any = {};
        const subscription: null | StreamingRead<ResolvedEvent<EventType>> = this.getMainStream();
        if (subscription) {
            try {
                for await (const resolvedEvent of subscription) {
                    const event: any = resolvedEvent.event;
                    /*  if (event && event.metadata?.$correlationId !== EventId && event.metadata?.state === "delivered") {
                          console.log('Last checkpoint', event)
                          return false;
                      } else */
                    if (event && event.metadata?.$correlationId === EventId)
                        return this.eventState(event)
                }

            } catch (err) {
                console.error('Error EventsPlugin.processStateChecker', err)
            }
            subscription.destroy();
        }
        return false;
    }

    private template(type: string, data: ModelEventWrapper<DataModel> | ModelEventWrapper<DataModel>[] | any, metadata: ITemplateEvent) {
        return jsonEvent({
            type,
            data,
            metadata
        })
    }

    private GenerateEventInternalId(data: ModelEventWrapper<DataModel> | ModelEventWrapper<DataModel>[], method: string) {
        return md5(JSON.stringify({payload: data, method, company: 'nowla'}));
    }
}

export default EventsPlugin;

