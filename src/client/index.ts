/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 09/02/2022
 **  @Description
 ***********************************************************/
import { StreamingRead, ResolvedEvent, EventType } from "@eventstore/db-client";
import {
    BACKWARDS,
    END,
    EventData,
    EventStoreDBClient,
    IEvenStoreConfig,
    IReadStreamConfig,
    ITemplateEvent,
    jsonEvent,
    md5
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

class EventsPlugin<DataModel> {

    public create: IMethodFunction<DataModel, 'create'>;
    public update: IMethodFunction<DataModel, 'update'>;
    public delete: IMethodFunction<DataModel, 'delete'>;
    public recover: IMethodFunction<DataModel, 'recover'>;

    protected methods: string[];
    protected streamName: string;
    protected client: EventStoreDBClient;
    protected credentials: IEvenStoreConfig["credentials"];
    private readonly causationRoute: string[];

    constructor(EvenStoreConfig: IEvenStoreConfig,
                streamName: string,
                methods: string[],
                causationRoute: string[]) {
        this.methods = methods;
        this.streamName = streamName;
        this.client = new EventStoreDBClient(
            EvenStoreConfig.connexion,
            EvenStoreConfig.security,
            EvenStoreConfig.credentials);
        this.credentials = EvenStoreConfig.credentials;
        this.causationRoute = causationRoute;
        for (const method of this.methods) {
            // @ts-ignore
            this[method] = async (data: ModelEventWrapper<DataModel> | ModelEventWrapper<DataModel>[],
                                  contributor?: IContributor,
                                  typeOrigin?: 'create' | 'update' | 'delete' | 'recover' | string
                                  // this.create({...}, {id: xxxx}, event.typeOrigin)
            ): Promise<{ data: ModelEventWrapper<DataModel> | ModelEventWrapper<DataModel[]>, ack: () => void }> => {
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
            let state: ModelEventWrapper<DataModel> | ModelEventWrapper<DataModel>[] | "processing" | null | "create" | "delivered" = await this.processStateChecker(requestId);
            console.log('my stream name', streamName, state)
            if (state === "processing") {
                console.log('------------- processing')
                const state = await this.eventCompletedHandler(streamName, requestId);
                resolve({payload: state, requestId})
            } else if (state) {
                console.log('------------- state')
                resolve({payload: state, requestId});
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
                state = await this.eventCompletedHandler(streamName, requestId,
                    () => (this.appendToStream(streamName, template)));
                resolve({payload: state, requestId});
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

    private eventState(event: any, subscription: StreamingRead<ResolvedEvent<EventType>>) {
        switch (event.metadata?.state) {
            // In case of delivered we allow user to renew the entry
            // In case of complete we send the last information to the user
            case 'error':
            case 'delivered':
            case 'completed':
                subscription.destroy();
                return event.data
            // In case of processing we transparency send the user to the pending room
            case 'processing':
                subscription.destroy();
                return event.metadata?.state
            default:
                subscription.destroy();
                return true;
        }
    }

    private async processStateChecker(EventId: string) {
        let data: any = null;
        try {
            const subscription = this.getMainStream();
            if (subscription) {
                for await (const resolvedEvent of subscription) {
                    const event: any = resolvedEvent.event;
                    if (event && event.metadata?.$correlationId !== EventId && event.metadata?.state === "delivered") {
                        console.log('Last checkpoint', event)
                        return true;
                    } else if (event && event.metadata?.$correlationId === EventId)
                        return this.eventState(event, subscription)
                }

            }
        } catch (err) {
            console.error('Error EventsPlugin.processStateChecker', err)
        }

        return data;
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

