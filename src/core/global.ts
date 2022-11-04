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
	PersistentSubscriptionBase, PersistentSubscriptionToStream,
	PersistentSubscriptionToStreamSettings,
	START,
	StreamSubscription
}                       from "@eventstore/db-client";
import md5              from "md5";
import bigInt           from "big-integer";
import {EventEmitter}   from 'events';
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
	settings?: {
		ResolveLinkTos?: boolean,   //	Whether the subscription should resolve link events to their linked events.	false
		StartFrom?: 'end' | 'start' | BigInt, //The exclusive position in the stream or transaction file the subscription should start from.	null (start from the end of the stream)
		ExtraStatistics?: boolean,  // Whether to track latency statistics on this subscription.	false
		MessageTimeout?: number,	// The amount of time after which to consider a message as timed out and retried.	30 (seconds)
		MaxRetryCount?: number,	    // The maximum number of retries (due to timeout) before a message is considered to be parked.	10
		LiveBufferSize?: number,	//The size of the buffer (in-memory) listening to live messages as they happen before paging occurs.	500
		ReadBatchSize?: number, 	//The number of events read at a time when paging through history.	20
		HistoryBufferSize?: number,	// The number of events to cache when paging through history.	500
		CheckPointAfter?: number,	// The amount of time to try to checkpoint after.	2 seconds
		MinCheckPointCount?: number,	// The minimum number of messages to process before a checkpoint may be written.	10
		MaxCheckPointCount?: number,	// The maximum number of messages not checkpointed before forcing a checkpoint.	1000
		MaxSubscriberCount?: number,	// The maximum number of subscribers allowed.	0 (unbounded)
		/*
				RoundRobin (default)
				Distributes events to all clients evenly. If the client bufferSize is reached, the client won't receive more events until it acknowledges or not acknowledges events in its buffer.

				This strategy provides equal load balancing between all consumers in the group.

				#DispatchToSingle
				Distributes events to a single client until the bufferSize is reached. After that, the next client is selected in a round-robin style, and the process repeats.

				This option can be seen as a fall-back scenario for high availability, when a single consumer processes all the events until it reaches its maximum capacity. When that happens, another consumer takes the load to free up the main consumer resources.

				#Pinned
				For use with an indexing projection such as the system $by_category projection.

				EventStoreDB inspects the event for its source stream id, hashing the id to one of 1024 buckets assigned to individual clients. When a client disconnects, its buckets are assigned to other clients. When a client connects, it is assigned some existing buckets. This naively attempts to maintain a balanced workload.

				The main aim of this strategy is to decrease the likelihood of concurrency and ordering issues while maintaining load balancing. This is not a guarantee, and you should handle the usual ordering and concurrency issues.

		 */
		NamedConsumerStrategy?: 'RoundRobin' | 'DispatchToSingle' | 'Pinned' // default RoundRobin
	};
	streamSettings?: {
		subscriptionDropped?: '', //The action to call if the subscription is dropped.
		bufferSize?: number, //	The number of in-flight messages this client is allowed. Default: 10
		autoAck?: boolean   //	Whether to automatically acknowledge messages after eventAppeared returns. Default: true
	}
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
	consumer_job_name: string | null
}


type IEventErrorResult = {
	origin: string,
	details: any
}

type IEventResponseError = {
	data: any | undefined,
	origin: string,
	model?: any,
	customs?: any,
	status?: IMetadata<any>['state'],
	type: ITypeOrigin
	message: string;
}


type IEventResponseSuccess<CustomSchema> = {
	origin: string,
	data: any
	model?: any,
	customs?: any,
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
	// PersistentSubscription,
	PersistentSubscriptionToStreamSettings,
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
