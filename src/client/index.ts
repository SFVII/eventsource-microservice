/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 09/02/2022
 **  @Description
 ***********************************************************/
import {
	END,
	EventType,
	PARK,
	PersistentSubscriptionToStream,
	PersistentSubscriptionToStreamSettings,
	persistentSubscriptionToStreamSettingsFromDefaults
}                                  from "@eventstore/db-client";
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
	START
}                                  from "../core/global";
import {EventParser, IEventCreate} from "../core/CommonResponse";
import {uuid}                      from "uuidv4";

export interface IMethodFunctionResponse {
	data: IEventResponseSuccess<any> | IEventResponseError,
	request_id: string,
	error?: any,
	ack: () => (requestId: string, method: string, payload: any, streamName: string, causationRoute: string[]) => void
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

type IDataTreatedList = { id: string, event: EventType | 'pending', date: Date, causation: string | null }
type IDataTreatedListFoundResult = EventType | false | undefined


/**
 *
 */
class DataTreated {
	public QueueLimitRetry: number = 100;
	public IntervalClear: number = 15;
	protected list: IDataTreatedList[] = [];
	private _minutes = 1000;
	private clear_process: boolean = false;

	constructor() {
		setTimeout(() => this.clearOldFile(), 10000);
	}

	get clearTime(): number {
		return this.IntervalClear * this._minutes;
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

	async find(IdEvent: string, catchStreamResult: string | undefined | null = null, specificQuery?: any, retry: number = 0): Promise<IDataTreatedListFoundResult> {
		if (retry && retry > this.QueueLimitRetry) return false;
		if (!this.list.length) {
			await this.sleep(this.clearTime / this.QueueLimitRetry);
			return this.find(IdEvent, catchStreamResult, specificQuery, ++retry);
		} else {
			//	console.log('AYOOOO event : %s, catchstreamresult %s === %s', IdEvent, catchStreamResult)
			const lookup = this.list.find((doc: IDataTreatedList) => {
				if (catchStreamResult) {
					if (specificQuery && typeof specificQuery === 'object') {
						console.log('Specficif query', specificQuery)
						// @ts-ignore
						if (doc.causation === catchStreamResult && typeof doc.event === 'object' && doc.id === IdEvent) {
							for (const x in specificQuery) {
								// @ts-ignore
								if (!(doc.event?.data && doc.event?.data?.data && doc.event?.data?.data[x])) return false;
							}
							// @ts-ignore
							console.log('Find It', doc.event.data, doc.event.data?.data);
							return true;
						} else return false;
					} else {
						console.log('Specficif query', specificQuery)
						return (catchStreamResult === doc.causation && doc.id === IdEvent)
					}
					//console.log('Catch stream', catchStreamResult, catchStreamResult === doc.causation && doc.id === IdEvent)
				} else {
					return doc.id === IdEvent
				}
			});
			if (lookup && lookup.event === 'pending' || !lookup) {
				await this.sleep(200);
				return this.find(IdEvent, catchStreamResult, specificQuery, ++retry);
			}
			return lookup.event as EventType;
		}

	}

	sleep(ms: number) {
		return new Promise((resolve) => setTimeout(() => resolve(true), ms));
	}

	clearOldFile() {
		console.log('Clearing time is set to %d ms ', this.clearTime)
		setInterval(() => {
			this.clear_process = true;
			const limit = new Date();
			limit.setMinutes(limit.getMinutes() - this.IntervalClear)
			this.list = this.list.filter((doc: IDataTreatedList) => doc.date.getTime() >= limit.getTime()) || [];
			this.clear_process = false;
		}, this.clearTime);
	}
}
const errorsReboot = ['CANCELLED', 'canceled', 'UNAVAILABLE'];
const timerBeforeReboot = 3 * 1000 * 60;
class EventsPlugin<DataModel, Contributor> extends DataTreated {
	public QueueLimitRetry: number = 100;
	public IntervalClear: number = 15;
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
	private streamCursor:any;
	private readonly group: string = 'client-';

	constructor(EvenStoreConfig: IEvenStoreConfig, streamName: string, methods: string[], causationRoute: string[]) {

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
		for (const method of this.methods) {
			// @ts-ignore
			this[method] = async (data: ModelEventWrapper, contributor: IContributor, typeOrigin: 'create' | 'update' | 'delete' | 'recover' | string, catchStreamResult?: string, specificQuery ?: any
			): Promise<{
				data: ModelEventWrapper,
				request_id: string,
				error?: any,
				ack: () => void
			}> => {

				const {
					payload,
					requestId,
					error
				} = await this.EventMiddlewareEmitter(data, method, typeOrigin, contributor, catchStreamResult, specificQuery)
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
		console.log('INIT STREAM')
		this.InitStreamWatcher().catch((err: any) => {
			console.log('ERROR InitStreamWatcher', err)
			setTimeout(() => {
				process.exit(1);
			}, timerBeforeReboot)
		})
		this.initAppendToStream();
	}


	public getStreamStatus() {
		return this.streamCursor.isConnected();
	}


	private async InitStreamWatcher() {
		const state = await this.CreatePersistentSubscription(this.streamName);
		this.stream = await this.SubscribeToPersistent(this.streamName);
		if (this.stream) {
			this.stream.on('error', (err:any) => {
				console.error('error CreatePersistentSubscription', err)
				process.exit(-1)
			})
			this.stream.on('end', (err:any) => {
				console.error('error CreatePersistentSubscription', err)
				process.exit(-1)
			})
			this.stream.on('close', (err:any) => {
				console.error('error CreatePersistentSubscription', err)
				process.exit(-1)
			})
			for await (const resolvedEvent of this.stream) {
				try {
					const event: any = resolvedEvent.event;
					const eventParse = new EventParser(resolvedEvent);
					const state: false | null | true = this.eventState(eventParse.state)
					if (state) await this.add({
						id: eventParse.correlationId,
						event: {...event, data: eventParse.data},
						date: new Date(),
						causation: eventParse.metadata.consumer_job_name
					}).catch((err: any) => console.log('Add to cache queue error', err));
					this.stream.ack(resolvedEvent);
				} catch (err) {
					console.log('Event goes to parking')
					this.stream.nack(resolvedEvent, PARK);
				}
			}
		} else {
			console.log('This stream doesn not exist');
			console.log('restart...');
			process.exit(1);
		}
	}

	private SubscribeToPersistent(streamName: string): PersistentSubscriptionToStream<any> | null {
		return this.client.subscribeToPersistentSubscriptionToStream<any>(
				streamName,
				this.group,
				{bufferSize: 200}
			);
	}

	private async CreatePersistentSubscription(streamName: string): Promise<boolean> {
		console.log('Create Persistent Configuration', streamName, this.group, this.credentials)


		try {
			this.streamCursor =	await this.client.createPersistentSubscriptionToStream(
				streamName,
				this.group,
				persistentSubscriptionToStreamSettingsFromDefaults({startFrom: END}),
				{credentials: this.credentials}
			)
			return true;
		} catch (err) {
			const error = (err ? err.toString() : "").toLowerCase();
			if (error.includes('EXIST') || error.includes('exist')) {

				/*await this.client.updatePersistentSubscriptionToStream(
					streamName,
					this.group,
					persistentSubscriptionToStreamSettingsFromDefaults({startFrom: END}),
					{credentials: this.credentials}
				)*/
				console.log('Persistent subscription %s already exist', streamName)
				return true;
			} else {
				for (const k of errorsReboot) {
					if (error.includes(k))  {
						console.error('Error EventHandler.CreatePersistentSubscription', k);

						console.log('calling pod reboot in %d ms', timerBeforeReboot)
						setTimeout(() => {
							process.exit(1);
						}, timerBeforeReboot)

					}
				}
				return false;
			}

		}
	}


	private EventMiddlewareEmitter(data: ModelEventWrapper, method: string, typeOrigin?: string, contributor?: IContributor<Contributor>, catchStreamResult?: string, specificQuery?: any): Promise<{ payload: IEventResponseError | IEventResponseSuccess<any> | null, error?: any, requestId: string }> {

		return new Promise(async (resolve, reject) => {
			const requestId = this.GenerateEventInternalId(data, method);
			const streamName = this.streamName
			if (this.exist(requestId)) {
				const event: IDataTreatedListFoundResult = await this.find(requestId, catchStreamResult, specificQuery);
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
						contributor: addContributor(contributor),
						consumer_job_name: null
					}
				}
			})
			const template = this.template(method, eventParser.data, eventParser.buildMetadata);

			// this.add({id: requestId, event: 'pending', date: new Date()});

			this.appendToStream(streamName, template)

			const event: IDataTreatedListFoundResult = await this.find(requestId, catchStreamResult, specificQuery, 0);

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
			//		console.log('%s - sending %d of current list of %d and left %d', streamName, current_selection.length, current_queue, this._pendingTemplates[streamName].length)
					this.client.appendToStream(streamName || this.streamName, current_selection)
						.catch((err) => {
							console.log('Error EventsPlugin.add', err)
						})
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
		return uuid().toString();
		//return md5(JSON.stringify({payload: data, method, company: 'nowla'}));
	}
}

export default EventsPlugin;

