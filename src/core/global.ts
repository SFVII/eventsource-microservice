/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 11/02/2022
 **  @Description
 ***********************************************************/
import {
    BACKWARDS,
    END,
    EventData,
    EventStoreDBClient,
    jsonEvent,
    JSONType,
    PersistentSubscriptionBase,
    persistentSubscriptionSettingsFromDefaults,
    START,
    StreamSubscription
} from "@eventstore/db-client";
import md5 from "md5";
import EventCollection, {IEventCollection} from "./mongo-plugin";
import {PersistentSubscription} from "@eventstore/db-client/dist/types";
import bigInt from "big-integer";
import {EventEmitter} from 'events';
import * as querystring from "querystring";


enum EMethodList {
    create,
    update,
    delete,
    recover,
    worker,
    init
}

type MethodList = keyof typeof EMethodList;
type Method = MethodList[];
type IStartRevisionValues = bigint | 'start' | 'end'
type EventType = keyof typeof EMethodList;

interface WildCardValueString {
    [key: string]: string;
}

type IEventHandlerGroup = 'dispatch' | 'consumers' | 'global-event-handler' | string

type IDataLinkEvent = [string, any];
type IStream = {
    [V in MethodList]?: StreamSubscription
};
type IQueue = {
    [V in MethodList]?: StreamSubscription[];
}

type IQueueCustom = {
    [V in MethodList]?: { [key: string]: StreamSubscription[] }
} & IQueue

interface ITemplateEvent<Contributor> extends IMetadata<Contributor> {
}

interface IEvenStoreConfig {
    connexion: {
        endpoint: string
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
    credentials: IEvenStoreConfig["credentials"]
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
    causationId: string,
    trigger: string[]
}


type IMd5DataHash = string; // simple Md5 hash (ex 8e614206a5b7f665b6948d4f5c7c9a29) from input data

type ICausationId = string; // name of last mservice action consumer-x client-x etc...

type ICausationRoute = ICausationId[] // route to take ex -> mapping -> consumer (['mapping', 'consumer']) will execute mapping and publish on consumer string

type ITypeOrigin = 'create' | 'delete' | 'update' | 'recover' | string; // origin type of input action.

type IContributorBinding<T> = keyof T

type IContributor<T> = { // data model to track user of event action
    [key in IContributorBinding<T>]: T[key];
}

type IMetadata<Contributor> = {
    $correlationId: IMd5DataHash,
    $causationId: ICausationId,
    state: 'processing' | 'completed' | 'error' | 'delivered' | 'trigger' | 'system' | string,
    causationRoute: ICausationRoute,
    typeOrigin: ITypeOrigin,
    contributor: IContributor<Contributor | any>
}


type IEventErrorResult = {
    origin: string,
    details: any
}

type IEventResponseError = {
    data: any | undefined,
    origin: string,
    model?: any,
    customs?:any,
    status?: IMetadata<any>['state'],
    type: ITypeOrigin
    message: string;
}


type IEventResponseSuccess<CustomSchema> = {
    origin: string,
    data: any
    model?: any,
    customs?:any,
    status?: IMetadata<any>['state'],
    type: ITypeOrigin,
    updatedFields?: keyof CustomSchema[] | []
}

type IEventResponse<CustomSchema> = IEventResponseSuccess<CustomSchema> | IEventResponseError


export {
    IEventResponse,
    IEventErrorResult,
    IEventResponseError,
    IEventResponseSuccess,
    IMd5DataHash,
    ICausationId,
    ICausationRoute,
    ITypeOrigin,
    ITriggerList,
    IContributorBinding,
    IContributor,
    IMetadata,
    EventEmitter,
    bigInt,
    PersistentSubscription,
    EventCollection,
    persistentSubscriptionSettingsFromDefaults,
    PersistentSubscriptionBase,
    jsonEvent,
    EventStoreDBClient,
    END,
    START,
    IDataLinkEvent,
    IEventHandlerGroup,
    IListStreamSubscription,
    IStartRevision,
    StreamSubscription,
    IAvailableEvent,
    IReadStreamConfig,
    IEvenStoreConfig,
    IQueue,
    IQueueCustom,
    IStream,
    ITemplateEvent,
    EventType,
    IStartRevisionValues,
    Method,
    MethodList,
    EMethodList,
    JSONType,
    BACKWARDS,
    EventData,
    md5
}
