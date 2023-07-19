"use strict";
/***********************************************************
 **  @project
 **  @file
 **  @author Brice Daupiard <brice.daupiard@nowbrains.com>
 **  @Date 02/05/2023
 **  @Description
 ***********************************************************/
Object.defineProperty(exports, "__esModule", { value: true });
exports.sleep = exports.getQueueName = exports.ServiceNamePatternSplitter = void 0;
const ServiceNamePatternSplitter = (raw) => {
    const pattern = raw.match(/_.*-\d+/);
    if (pattern) {
        console.log('pattern', pattern);
        const [queueName, ServiceNameAndReplicate] = raw.split('_');
        const Replicate = ServiceNameAndReplicate.split('-').pop();
        return [queueName, Replicate].join('_');
    }
    else {
        console.log('PATTERN IS NOT GOOD! Please respect the pattern "<QueueName>_<serviceName>-[0,9]"', raw);
        process.exit(0);
    }
};
exports.ServiceNamePatternSplitter = ServiceNamePatternSplitter;
const getQueueName = (raw) => {
    const pattern = raw.match(/_.*-\d+/);
    if (pattern) {
        console.log('pattern', pattern);
        const [queueName, ServiceNameAndReplicate] = raw.split('_');
        return queueName;
    }
    else
        return null;
};
exports.getQueueName = getQueueName;
const sleep = async (ms) => {
    return new Promise((resolve) => {
        setTimeout(() => {
            resolve(true);
        }, ms);
    });
};
exports.sleep = sleep;
