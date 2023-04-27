/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 11/02/2022
 **  @Description
 ***********************************************************/
import { BACKWARDS, END, EventData, EventStoreDBClient, jsonEvent, JSONType, PersistentSubscriptionBase, PersistentSubscriptionToStream, PersistentSubscriptionToStreamSettings, START, StreamSubscription } from "@eventstore/db-client";
import md5 from "md5";
import bigInt from "big-integer";
import { EventEmitter } from 'events';
declare enum EMethodList {
    create = 0,
    update = 1,
    delete = 2,
    recover = 3,
    worker = 4,
    init = 5
}
type MethodList = keyof typeof EMethodList;
type Method = MethodList[];
type IStartRevisionValues = bigint | 'start' | 'end';
type EventType = keyof typeof EMethodList;
type IEventHandlerGroup = 'dispatch' | 'consumers' | 'global-event-handler' | string;
type IDataLinkEvent = [string, any];
type IStream = {
    [V in MethodList]?: StreamSubscription;
};
type IQueue = {
    [V in MethodList]?: StreamSubscription[];
};
type IQueueCustom = {
    [V in MethodList]?: {
        [key: string]: StreamSubscription[];
    };
} & IQueue;
interface ITemplateEvent<Contributor> extends IMetadata<Contributor> {
}
interface IEvenStoreConfig {
    connexion: {
        endpoint: string;
        [key: string]: any;
    };
    security: {
        insecure: boolean;
        [key: string]: any;
    };
    credentials: {
        username: string;
        password: string;
    };
    settings?: {
        ResolveLinkTos?: boolean;
        StartFrom?: 'end' | 'start' | BigInt;
        ExtraStatistics?: boolean;
        MessageTimeout?: number;
        MaxRetryCount?: number;
        LiveBufferSize?: number;
        ReadBatchSize?: number;
        HistoryBufferSize?: number;
        CheckPointAfter?: number;
        MinCheckPointCount?: number;
        MaxCheckPointCount?: number;
        MaxSubscriberCount?: number;
        NamedConsumerStrategy?: 'RoundRobin' | 'DispatchToSingle' | 'Pinned';
    };
    streamSettings?: {
        subscriptionDropped?: '';
        bufferSize?: number;
        autoAck?: boolean;
    };
}
interface IReadStreamConfig {
    direction: "backwards" | "forwards";
    fromRevision: "start" | "end";
    maxCount: number;
    credentials: IEvenStoreConfig["credentials"];
}
interface IStartRevision {
    [key: string]: IStartRevisionValues;
}
interface IListStreamSubscription {
    [key: string]: PersistentSubscriptionToStream;
}
interface ITriggerList {
    causationId: string;
    trigger: string[];
}
type IMd5DataHash = string;
type ICausationId = string;
type ICausationRoute = ICausationId[];
type ITypeOrigin = 'create' | 'delete' | 'update' | 'recover' | string;
type IContributorBinding<T> = keyof T;
type IContributor<T> = {
    [key in IContributorBinding<T>]: T[key];
};
type IMetadata<Contributor> = {
    $correlationId: IMd5DataHash;
    $causationId: ICausationId;
    state: 'processing' | 'completed' | 'error' | 'delivered' | 'trigger' | 'system' | string;
    causationRoute: ICausationRoute;
    typeOrigin: ITypeOrigin;
    contributor: IContributor<Contributor | any>;
    consumer_job_name: string | null;
};
type IEventErrorResult = {
    origin: string;
    details: any;
};
type IEventResponseError = {
    data: any | undefined;
    origin: string;
    model?: any;
    customs?: any;
    status?: IMetadata<any>['state'];
    type: ITypeOrigin;
    message: string;
};
type IEventResponseSuccess<CustomSchema> = {
    origin: string;
    data: any;
    model?: any;
    customs?: any;
    status?: IMetadata<any>['state'];
    type: ITypeOrigin;
    updatedFields?: keyof CustomSchema[] | [];
};
type IEventResponse<CustomSchema> = IEventResponseSuccess<CustomSchema> | IEventResponseError;
export { IEventResponse, IEventErrorResult, IEventResponseError, IEventResponseSuccess, IMd5DataHash, ICausationId, ICausationRoute, ITypeOrigin, ITriggerList, IContributorBinding, IContributor, IMetadata, EventEmitter, bigInt, PersistentSubscriptionToStreamSettings, PersistentSubscriptionBase, jsonEvent, EventStoreDBClient, END, START, IDataLinkEvent, IEventHandlerGroup, IListStreamSubscription, IStartRevision, StreamSubscription, IReadStreamConfig, IEvenStoreConfig, IQueue, IQueueCustom, IStream, ITemplateEvent, EventType, IStartRevisionValues, Method, MethodList, EMethodList, JSONType, BACKWARDS, EventData, md5 };
