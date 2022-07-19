/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 11/02/2022
 **  @Description
 ***********************************************************/
import { BACKWARDS, END, EventData, EventStoreDBClient, jsonEvent, JSONType, PersistentSubscriptionBase, persistentSubscriptionSettingsFromDefaults, START, StreamSubscription } from "@eventstore/db-client";
import md5 from "md5";
import EventCollection, { IEventCollection } from "./mongo-plugin";
import { PersistentSubscription } from "@eventstore/db-client/dist/types";
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
declare type MethodList = keyof typeof EMethodList;
declare type Method = MethodList[];
declare type IStartRevisionValues = bigint | 'start' | 'end';
declare type EventType = keyof typeof EMethodList;
declare type IEventHandlerGroup = 'dispatch' | 'consumers' | 'global-event-handler' | string;
declare type IDataLinkEvent = [string, any];
declare type IStream = {
    [V in MethodList]?: StreamSubscription;
};
declare type IQueue = {
    [V in MethodList]?: StreamSubscription[];
};
declare type IQueueCustom = {
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
}
interface IReadStreamConfig {
    direction: "backwards" | "forwards";
    fromRevision: "start" | "end";
    maxCount: number;
    credentials: IEvenStoreConfig["credentials"];
}
interface IAvailableEvent extends IEventCollection {
}
interface IStartRevision {
    [key: string]: IStartRevisionValues;
}
interface IListStreamSubscription {
    [key: string]: PersistentSubscription;
}
interface ITriggerList {
    causationId: string;
    trigger: string[];
}
declare type IMd5DataHash = string;
declare type ICausationId = string;
declare type ICausationRoute = ICausationId[];
declare type ITypeOrigin = 'create' | 'delete' | 'update' | 'recover' | string;
declare type IContributorBinding<T> = keyof T;
declare type IContributor<T> = {
    [key in IContributorBinding<T>]: T[key];
};
declare type IMetadata<Contributor> = {
    $correlationId: IMd5DataHash;
    $causationId: ICausationId;
    state: 'processing' | 'completed' | 'error' | 'delivered' | 'trigger' | 'system' | string;
    causationRoute: ICausationRoute;
    typeOrigin: ITypeOrigin;
    contributor: IContributor<Contributor | any>;
};
declare type IEventErrorResult = {
    origin: string;
    details: any;
};
declare type IEventResponseError = {
    data: any | undefined;
    origin: string;
    model?: any;
    status?: IMetadata<any>['state'];
    type: ITypeOrigin;
    message: string;
};
declare type IEventResponseSuccess<CustomSchema> = {
    origin: string;
    data: any;
    model?: any;
    status?: IMetadata<any>['state'];
    type: ITypeOrigin;
    updatedFields?: keyof CustomSchema[];
};
declare type IEventResponse<CustomSchema> = IEventResponseSuccess<CustomSchema> | IEventResponseError;
export { IEventResponse, IEventErrorResult, IEventResponseError, IEventResponseSuccess, IMd5DataHash, ICausationId, ICausationRoute, ITypeOrigin, ITriggerList, IContributorBinding, IContributor, IMetadata, EventEmitter, bigInt, PersistentSubscription, EventCollection, persistentSubscriptionSettingsFromDefaults, PersistentSubscriptionBase, jsonEvent, EventStoreDBClient, END, START, IDataLinkEvent, IEventHandlerGroup, IListStreamSubscription, IStartRevision, StreamSubscription, IAvailableEvent, IReadStreamConfig, IEvenStoreConfig, IQueue, IQueueCustom, IStream, ITemplateEvent, EventType, IStartRevisionValues, Method, MethodList, EMethodList, JSONType, BACKWARDS, EventData, md5 };
