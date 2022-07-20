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
} /*<DataModel> = {
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
}*/


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


let list: IDataTreatedList[] = [];

class DataTreated {

    private clear_process: boolean = false;

    constructor() {
        this.clearOldFile();
    }

    public exist(IdEvent: string) {
        return list.findIndex((doc: IDataTreatedList) => doc.id === IdEvent) > -1;
    }

    public add(entry: IDataTreatedList) {
        if (this.clear_process) {
            this.add(entry);
        } else {
            const index = list.findIndex((doc: IDataTreatedList) => entry.id == doc.id)
            console.log('Add to result queue index is %d', index, entry)
            if (index > -1) list[index] = entry;
            else list.unshift(entry);
        }

    }


    async find(IdEvent: string, retry: number = 0): Promise<IDataTreatedListFoundResult> {
        if (retry && retry > 200) return false;
        console.log('------------TIIIIIIIIIIEEEE--------', IdEvent, retry);
        if (!list.length) {
            console.log('------------List empty--------', IdEvent, retry);
            await this.sleep(200);
            return this.find(IdEvent, ++retry);
        } else {
            console.log('------------Lookup--------', IdEvent, retry);
            const lookup = list.find((doc: IDataTreatedList) => doc.id === IdEvent);
            console.log('THE LOOKUP', lookup);
            if (lookup && lookup.event === 'pending' || !lookup) {
                console.log('Lookup event %s', lookup);
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
            console.log('Clear message response queue');
            list = list.filter((doc: IDataTreatedList) => doc.date.getTime() >= limit.getTime()) || [];
            console.log('new list', list);
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
        await this.CreatePersistentSubscription(this.streamName);
        this.stream = this.SubscribeToPersistent(this.streamName);
        for await (const resolvedEvent of this.stream) {
            const event: any = resolvedEvent.event;
            const state: false | null | true = this.eventState(event.metadata.state)
            console.log('state', state, event.metadata.state);
            if (state === true) this.add({id: event.metadata['$correlationId'], event, date: new Date()});
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
                console.log('Event exist try to call return it')
                const event: IDataTreatedListFoundResult = await this.find(requestId);
                console.log('Event found')
                if (event && event.data) {
                    return resolve({
                        payload: event?.data as IEventResponseError | IEventResponseSuccess<any>,
                        requestId
                    });
                }
                console.log('Continue, not found', requestId)
            }

            const eventParser = new EventParser(data, {
                $correlationId: requestId,
                state: 'processing',
                $causationId: this.streamName,
                causationRoute: [...this.causationRoute],
                typeOrigin: typeOrigin ? typeOrigin : method,
                contributor: addContributor(contributor)
            })

            console.log('real metadata', {
                $correlationId: requestId,
                state: 'processing',
                $causationId: this.streamName,
                causationRoute: [...this.causationRoute],
                typeOrigin: typeOrigin ? typeOrigin : method,
                contributor: addContributor(contributor)
            })

            console.log('eventParser', eventParser.data, eventParser.buildMetadata)

            const template = this.template(method, eventParser.data, eventParser.buildMetadata);

            // this.add({id: requestId, event: 'pending', date: new Date()});

            await this.appendToStream(streamName, template)

            console.log('stream', template);
            const event: IDataTreatedListFoundResult = await this.find(requestId, 0);
            console.log('event', event);

            if (event) resolve({payload: event.data as IEventResponseError | IEventResponseSuccess<any>, requestId});
            else {
                reject({payload: {error: 'Error on pending items create'}, request_id: requestId})
            }
        })
    }

    private async appendToStream(streamName: string, template: EventData) {
        return this.client.appendToStream(streamName || this.streamName,
            [template])
            .catch((err) => {
                console.log('Error EventsPlugin.add', err)
            })
    }


    private eventState(state: 'delivered' | 'error' | 'completed' | 'processing' | string) {
        switch (state) {
            // In case of delivered we allow user to renew the entry
            // In case of complete we send the last information to the user
            //  case 'delivered':
            case 'delivered':
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

