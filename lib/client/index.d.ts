import { EventStoreDBClient, IEvenStoreConfig } from "../core/global";
export interface IMethodFunctionResponse {
    data: any;
    ack: () => (requestId: string, method: string, payload: any, streamName: string, causationRoute: string[]) => void;
}
export declare type IMethodFunction<DataModel, Type> = (data: ModelEventWrapper<DataModel> | ModelEventWrapper<DataModel>[], contributor?: IContributor, typeOrigin?: 'create' | 'update' | 'delete' | 'recover' | Type, streamName?: string, causationRoute?: string[]) => Promise<IMethodFunctionResponse>;
export declare type IContributor = {
    id_contact?: string;
    id_nowteam?: string;
    id_external?: string;
    lastname?: string;
    firstname?: string;
    account?: string | Partial<any> & {
        _id: string;
    };
    group?: string | Partial<any> & {
        _id: string;
    };
};
export declare type ModelEventWrapper<DataModel> = {
    model?: {
        fs?: string | undefined;
        db?: string | undefined;
        sf?: string | undefined;
        [key: string]: string | undefined;
    };
    i18n?: {
        model?: string;
        language: string;
        fields: string[];
        shouldRenderJson?: boolean;
    };
    origins?: [string, string][];
    value: DataModel | DataModel[];
    fields?: (keyof DataModel)[];
};
export declare const addContributor: (contributor?: IContributor) => {
    account: string | undefined;
    group: string | undefined;
    id_contact?: string | undefined;
    id_nowteam?: string | undefined;
    id_external?: string | undefined;
    lastname?: string | undefined;
    firstname?: string | undefined;
};
declare class EventsPlugin<DataModel> {
    create: IMethodFunction<DataModel, 'create'>;
    update: IMethodFunction<DataModel, 'update'>;
    delete: IMethodFunction<DataModel, 'delete'>;
    recover: IMethodFunction<DataModel, 'recover'>;
    protected methods: string[];
    protected streamName: string;
    protected client: EventStoreDBClient;
    protected credentials: IEvenStoreConfig["credentials"];
    private readonly causationRoute;
    constructor(EvenStoreConfig: IEvenStoreConfig, streamName: string, methods: string[], causationRoute: string[]);
    private delivered;
    private EventMiddlewareEmitter;
    private appendToStream;
    private eventCompletedHandler;
    private readStreamConfig;
    private getMainStream;
    private eventState;
    private processStateChecker;
    private template;
    private GenerateEventInternalId;
}
export default EventsPlugin;
