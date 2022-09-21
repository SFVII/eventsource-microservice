/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 09/02/2022
 **  @Description
 ***********************************************************/
import {EventType} from "@eventstore/db-client";
import {
    EventData,
    EventStoreDBClient,
    IContributor,
    IEvenStoreConfig,
    IEventResponseError,
    IEventResponseSuccess,
    ITemplateEvent,
    jsonEvent,
    md5,
    persistentSubscriptionSettingsFromDefaults,
    START
} from "../core/global";
import {EventParser, IEventCreate} from "../core/CommonResponse";

export interface IMethodFunctionResponse {
    data: IEventResponseSuccess<any> | IEventResponseError,
    request_id: string,
    error?: any,
    ack: () => (requestId: string,
                method: string,
                payload: any,
                streamName: string,
                causationRoute: string[]) => void
}

export type IMethodFunction<Contributor, Type> = (
    data: ModelEventWrapper,
    contributor?: IContributor<Contributor>,
    typeOrigin?: 'create' | 'update' | 'delete' | 'recover' | Type,
    streamName?: string,
    customs?: any,
    causationRoute?: string[])
    => Promise<IMethodFunctionResponse>


export interface ModelEventWrapper extends IEventCreate {
}


export const addContributor = (contributor: IContributor<any> = {
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


const QueueLimitRetry = 10;

class DataTreated {

    protected list: IDataTreatedList[] = [];
    private clear_process: boolean = false;

    constructor() {
        this.clearOldFile();
    }

    public exist(IdEvent: string) {
        return this.list.findIndex((doc: IDataTreatedList) => doc.id === IdEvent) > -1;
    }

    public async add(entry: IDataTreatedList) {
        if (this.clear_process) {
            await this.sleep(200);
            await this.add(entry);
        } else {
            const index = this.list.findIndex((doc: IDataTreatedList) => entry.id == doc.id)
            if (index > -1) this.list[index] = entry;
            else this.list.unshift(entry);
        }

    }


    async find(IdEvent: string, retry: number = 0): Promise<IDataTreatedListFoundResult> {
        if (retry && retry > QueueLimitRetry) return false;
        if (!this.list.length) {
            await this.sleep(200);
            return this.find(IdEvent, ++retry);
        } else {
            const lookup = this.list.find((doc: IDataTreatedList) => doc.id === IdEvent);
            if (lookup && lookup.event === 'pending' || !lookup) {
                await this.sleep(200);
                return this.find(IdEvent, ++retry);
            } else return lookup.event as EventType;
        }

    }

    sleep(ms: number) {
        return new Promise((resolve) => setTimeout(() => resolve(true), ms));
    }

    clearOldFile() {
        setInterval(() => {
            this.clear_process = true;
            const limit = new Date();
            limit.setMinutes(limit.getMinutes() - 1)
            this.list = this.list.filter((doc: IDataTreatedList) => doc.date.getTime() >= limit.getTime()) || [];
            this.clear_process = false;
        }, 1000 * 60);
    }
}

class EventsPlugin<DataModel, Contributor> extends DataTreated {

    public create: IMethodFunction<DataModel, 'create'>;
    public update: IMethodFunction<DataModel, 'update'>;
    public delete: IMethodFunction<DataModel, 'delete'>;
    public recover: IMethodFunction<DataModel, 'recover'>;

    protected methods: string[];
    protected streamName: string;
    protected client: EventStoreDBClient;
    protected credentials: IEvenStoreConfig["credentials"];
    private _pendingTemplates: { [key: string]: EventData[] } = {};
    private readonly causationRoute: string[];
    private stream: any;
    private readonly group: string = 'client-';

    constructor(EvenStoreConfig: IEvenStoreConfig,
                streamName: string,
                methods: string[],
                causationRoute: string[]) {
        super()
        this.methods = methods;
        this.streamName = streamName;
        this._pendingTemplates[streamName] = [];
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
        this.initAppendToStream();
        for (const method of this.methods) {
            // @ts-ignore
            this[method] = async (data: ModelEventWrapper, contributor: IContributor,
                                  typeOrigin: 'create' | 'update' | 'delete' | 'recover' | string
            ): Promise<{
                data: ModelEventWrapper,
                request_id: string,
                error?: any,
                ack: () => void
            }> => {

                const {
                    payload,
                    requestId,
                    error,
                } = await this.EventMiddlewareEmitter(data, method, typeOrigin, contributor)
                    // @ts-ignore
                    .catch((err: { payload: any, request_id: requestId }) => {
                        return {
                            payload: null,
                            error: err.payload,
                            requestId: err.request_id
                        }
                    })
                return {
                    data: payload as IEventResponseSuccess<any> | IEventResponseError,
                    request_id: requestId,
                    error,
                    ack: () => {
                    }
                }
            }
        }
    }


    private async InitStreamWatcher() {
        try {
            await this.CreatePersistentSubscription(this.streamName);
            this.stream = this.SubscribeToPersistent(this.streamName);
            for await (const resolvedEvent of this.stream) {
                const event: any = resolvedEvent.event;
                const eventParse = new EventParser(resolvedEvent);
                const state: false | null | true = this.eventState(eventParse.state)
                if (state === true) await this.add({
                    id: eventParse.correlationId,
                    event: {...event, data: eventParse.data},
                    date: new Date()
                });
                this.stream.ack(resolvedEvent);
            }
        } catch (err) {
            console.log('Stream crashed restart pod', err)
            process.exit(0)
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
                return true;
            } else console.error('Error EventHandler.CreatePersistentSubscription', err);
            return false;
        }
    }


    private EventMiddlewareEmitter(data: ModelEventWrapper,
                                   method: string,
                                   typeOrigin?: string,
                                   contributor?: IContributor<Contributor>): Promise<{ payload: IEventResponseError | IEventResponseSuccess<any> | null, error?: any, requestId: string }> {

        return new Promise(async (resolve, reject) => {
            const requestId = this.GenerateEventInternalId(data, method);
            const streamName = this.streamName
            if (this.exist(requestId)) {
                const event: IDataTreatedListFoundResult = await this.find(requestId);
                if (event && event.data) {
                    return resolve({
                        payload: event?.data as IEventResponseError | IEventResponseSuccess<any>,
                        requestId
                    });
                }
            }

            const eventParser = new EventParser({
                type: typeOrigin ? typeOrigin : method,
                event: {
                    data,
                    metadata: {
                        $correlationId: requestId,
                        state: 'processing',
                        $causationId: this.streamName,
                        causationRoute: [...this.causationRoute],
                        typeOrigin: typeOrigin ? typeOrigin : method,
                        contributor: addContributor(contributor)
                    }
                }
            })
            const template = this.template(method, eventParser.data, eventParser.buildMetadata);

            // this.add({id: requestId, event: 'pending', date: new Date()});

            this.appendToStream(streamName, template)

            const event: IDataTreatedListFoundResult = await this.find(requestId, 0);

            if (event) resolve({payload: event.data as IEventResponseError | IEventResponseSuccess<any>, requestId});
            else {
                reject({payload: {error: 'Error on pending items create'}, request_id: requestId})
            }
        })
    }

    private initAppendToStream() {
        setInterval(() => {
            Object.keys(this._pendingTemplates).forEach((streamName: string) => {
                if (this._pendingTemplates[streamName].length) {
                    const current_queue = this._pendingTemplates[streamName].length
                    const current_selection = this._pendingTemplates[streamName]
                        .splice(0, this._pendingTemplates[streamName].length >= 50 ? 50 : this._pendingTemplates[streamName].length)

                    console.log('%s - sending %d of current list of %d and left %d', streamName, current_selection.length, current_queue, this._pendingTemplates[streamName].length)
                    this.client.appendToStream(streamName || this.streamName, current_selection)
                        .catch((err) => {
                            console.log('Error EventsPlugin.add', err)
                        })
                } else {
                    console.log('%s - empty', streamName)
                }

            })
        }, 100)
    }

    private appendToStream(streamName: string, template: EventData) {
        if (!this._pendingTemplates[streamName]) this._pendingTemplates[streamName] = [template];
        else this._pendingTemplates[streamName].push(template);

        /* this.client.appendToStream(streamName || this.streamName,
             [template])
             .catch((err) => {
                 console.log('Error EventsPlugin.add', err)
             })*/
    }


    private eventState(state: 'delivered' | 'error' | 'completed' | 'processing' | string) {
        switch (state) {
            // In case of delivered we allow user to renew the entry
            // In case of complete we send the last information to the user
            //  case 'delivered':
            // case 'delivered':
            case 'error':
            case 'completed':
                return true
            // In case of processing we transparency send the user to the pending room
            // case 'processing':
            //    return null
            default:
                return false;
        }
    }

    private template(type: string, data: ModelEventWrapper | ModelEventWrapper[] | any, metadata: ITemplateEvent<Contributor>) {
        return jsonEvent({
            type,
            data,
            metadata
        })
    }

    private GenerateEventInternalId(data: ModelEventWrapper | ModelEventWrapper[], method: string) {
        return md5(JSON.stringify({payload: data, method, company: 'nowla'}));
    }
}

export default EventsPlugin;

