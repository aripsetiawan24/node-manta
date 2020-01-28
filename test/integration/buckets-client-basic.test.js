/*
 * Copyright 2019 Joyent, Inc.
 */

/*
 * This is a quick/simple/basic run through all the Buckets API endpoints.
 * Tests probing edge cases or more heavily testing out Buckets features
 * should be in separate test files.
 */

var crypto = require('crypto');
var fs = require('fs');
var libuuid = require('uuid');
var os = require('os');
var path = require('path');
var test = require('tap').test;
var util = require('util');

var buckets = require('../../lib/buckets');
var logging = require('../lib/logging');
var manta = require('../../lib');
var testutils = require('../lib/utils');


/*
 * Globals
 */

var log = logging.createLogger();
var testOpts = {
    skip: !testutils.isBucketsEnabledSync(log) &&
        'this Manta does not support Buckets'
};

const TEST_RESOURCE_PREFIX = 'node-manta-test-buckets-client-basic-' +
    libuuid.v4().split('-')[0] + '-';



/*
 * Tests
 */

test('buckets client basic', testOpts, function (suite) {
    var client;
    var clientMethodsToTest;
    const BUCKET_NAME = TEST_RESOURCE_PREFIX + 'bucket';
    const OBJECT_NAME = TEST_RESOURCE_PREFIX + 'object';
    const SMALL_FILE_PATH = path.resolve(__dirname, 'corpus/small.file');
    const SMALL_FILE_SIZE = fs.statSync(SMALL_FILE_PATH).size;
    const SMALL_FILE_CONTENT = fs.readFileSync(SMALL_FILE_PATH);
    const SMALL_FILE_CONTENT_MD5 = crypto.createHash('md5').
        update(SMALL_FILE_CONTENT).digest('base64');

    test('setup client', function (t) {
        var clientOpts = {
            log: log,
            klass: buckets.MantaBucketsClient
        };
        client = manta.createBinClient(clientOpts);

        // We use this to enforce having an explicit basic test in this
        // test file for *every* MantaBucketsClient method.
        clientMethodsToTest = new Set(
            Object.keys(client.constructor.prototype));

        // ... except a few we don't bother testing:
        clientMethodsToTest.delete('bPath');
        clientMethodsToTest.delete('boPath');
        clientMethodsToTest.delete('bomPath');

        t.end();
    });

    test('isBucketsSupported', function (t) {
        clientMethodsToTest.delete('isBucketsSupported');
        client.isBucketsSupported(function (err, isSupported) {
            t.ifError(err);
            t.ok(isSupported, 'isSupported');
            t.end();
        });
    });

    test('createBucket', function (t) {
        clientMethodsToTest.delete('createBucket');
        client.createBucket(BUCKET_NAME, function (err) {
            t.ifError(err);
            t.end();
        });
    });

    test('headBucket', function (t) {
        clientMethodsToTest.delete('headBucket');
        client.headBucket(BUCKET_NAME, function (err, res) {
            t.ifError(err);
            t.end();
        });
    });

    test('createListBucketsStream', function (t) {
        clientMethodsToTest.delete('createListBucketsStream');
        // XXX add limit=1 or use prefix of our test prefix when supported, then
        // assert have our test bucket
        var s = client.createListBucketsStream();
        var theBuckets = [];
        s.on('readable', function onReadable() {
            var bucket;
            while ((bucket = s.read()) !== null) {
                theBuckets.push(bucket);
            }
        });
        s.once('error', function onError(err) {
            t.ifError(err);
            t.end();
        });
        s.once('end', function onEnd() {
            t.ok(theBuckets.length >= 1,
                'got at least one bucket in listing, theBuckets names: ' +
                theBuckets.map(function (b) { return b.name; }).join(', '));
            t.end();
        });
    });

    test('createBucketObject', function (t) {
        clientMethodsToTest.delete('createBucketObject');
        var inStream = fs.createReadStream(SMALL_FILE_PATH);
        var reqOpts = {
            headers: {
                'm-foo': 'bar'
            }
        };
        client.createBucketObject(inStream, BUCKET_NAME, OBJECT_NAME, reqOpts,
                                  function (err) {
            t.ifError(err);
            t.end();
        });
    });

    test('headBucketObject', function (t) {
        clientMethodsToTest.delete('headBucketObject');
        client.headBucketObject(BUCKET_NAME, OBJECT_NAME,
                                function (err, res) {
            t.ifError(err);
            t.ok(res);
            t.equal(res.headers['content-md5'], SMALL_FILE_CONTENT_MD5);
            t.equal(res.headers['content-length'], SMALL_FILE_SIZE.toString());
            t.equal(res.headers['m-foo'], 'bar');
            t.end();
        });
    });

    test('getBucketObject', function (t) {
        clientMethodsToTest.delete('getBucketObject');
        client.getBucketObject(BUCKET_NAME, OBJECT_NAME,
                                function (err, stream, res) {
            t.ifError(err);

            t.ok(res);
            t.equal(res.headers['content-md5'], SMALL_FILE_CONTENT_MD5);
            t.equal(res.headers['content-length'], SMALL_FILE_SIZE.toString());
            t.equal(res.headers['m-foo'], 'bar');

            t.ok(stream);
            var chunks = [];
            stream.on('data', function (chunk) {
                chunks.push(chunk);
            });
            stream.on('error', function (streamErr) {
                t.ifError(err);
                t.end();
            });
            stream.on('end', function (chunk) {
                var downloaded = Buffer.concat(chunks);
                t.strictDeepEqual(downloaded, SMALL_FILE_CONTENT);
                t.end();
            });
        });
    });

    test('putBucketObjectMetadata', function (t) {
        clientMethodsToTest.delete('putBucketObjectMetadata');

        var NEW_METADATA_VALUE = 'baz';
        client.putBucketObjectMetadata(BUCKET_NAME, OBJECT_NAME,
            {
                headers: {
                    'm-foo': NEW_METADATA_VALUE
                }
            },
            function (err, res) {
                t.ifError(err);

                t.ok(res);
                t.equal(res.headers['m-foo'], NEW_METADATA_VALUE);

                t.end();
            });
    });

    test('createListBucketObjectsStream', function (t) {
        clientMethodsToTest.delete('createListBucketObjectsStream');
        var s = client.createListBucketObjectsStream(BUCKET_NAME);
        var objects = [];
        s.on('readable', function onReadable() {
            var object;
            while ((object = s.read()) !== null) {
                objects.push(object);
            }
        });
        s.once('error', function onError(err) {
            t.ifError(err);
            t.end();
        });
        s.once('end', function onEnd() {
            t.equal(objects.length, 1,
                util.format('got one object in bucket %s: %j',
                    BUCKET_NAME, objects[0]));
            // Ensure expected fields per
            // https://github.com/joyent/manta-buckets-api/blob/master/docs/index.md#listbucketobjects
            t.equal(objects[0].name, OBJECT_NAME, 'has expected "name" field');
            t.equal(objects[0].type, 'bucketobject', 'has expected "type" field');
            t.ok(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/.test(objects[0].mtime),
                'has expected "mtime" field');
            t.equal(typeof(objects[0].etag), 'string',
                'has expected "etag" field');
            t.equal(typeof(objects[0].size), 'number',
                'has expected "size" field');
            t.equal(typeof(objects[0].contentType), 'string',
                'has expected "contentType" field');
            t.equal(typeof(objects[0].contentMD5), 'string',
                'has expected "contentMD5" field');
            t.end();
        });
    });

    test('deleteBucketObject', function (t) {
        clientMethodsToTest.delete('deleteBucketObject');
        client.deleteBucketObject(BUCKET_NAME, OBJECT_NAME, function (err) {
            t.ifError(err);
            t.end();
        });
    });

    test('deleteBucket', function (t) {
        clientMethodsToTest.delete('deleteBucket');
        client.deleteBucket(BUCKET_NAME, function (err) {
            t.ifError(err);
            t.end();
        });
    });

    test('have we tested all the client methods once?', function (t) {
        t.equal(clientMethodsToTest.size, 0,
            'the set of client methods remaining to test is empty: ' +
            JSON.stringify(Array.from(clientMethodsToTest)));
        t.end();
    });

    test('teardown', function (t) {
        if (client) {
            client.close();
        }
        t.end();
    });

    suite.end();
});
