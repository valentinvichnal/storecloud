/**
* @class storecloud
* @module Node
*/
var fs = require('fs');
var crypto = require('crypto');
var pathLib = require('path');
var rest = require('restler');
var moment = require('moment');
var mime = require('mime');
var _ = require('lodash');

module.exports = function (privateKey, googleServicesEmail, storageBucket) {
  // Lets pull from environment variables if information is not given
  googleServicesEmail = googleServicesEmail || process.env.GOOGLE_SERVICES_EMAIL;
  storageBucket = storageBucket || process.env.GCS_STORAGE_BUCKET;
  privateKey = privateKey || process.env.GCS_PRIVATE_KEY;

  if(!googleServicesEmail || !storageBucket || !privateKey) {
    // console.log(googleServicesEmail, '|', storageBucket, '|', privateKey);
    throw 'Google Cloud Storage not configured';
  }
  // Accepts paths too for private key
  if (!privateKey.match(/BEGIN (RSA )?PRIVATE KEY/)) {
    privateKey = fs.readFileSync(privateKey,'utf8').toString();
  }

  var storecloud = {
    /**
    * @param acl string See below
    *
    * https://developers.google.com/storage/docs/accesscontrol#extension
    * project-private     Gives permission to the project team based on their roles. Anyone who is part of the team has READ permission and project owners and project editors have FULL_CONTROL permission. This is the default ACL for newly created buckets. This is also the default ACL for newly created objects unless the default object ACL for that bucket has been changed.
    * private         Gives the bucket or object owner FULL_CONTROL permission for a bucket or object.
    * public-read       Gives the bucket or object owner FULL_CONTROL permission and gives all anonymous users READ permission. When you apply this to an object, anyone on the Internet can read the object without authenticating. When you apply this to a bucket, anyone on the Internet can list objects without authenticating. Important: By default, publicly readable objects are served with a Cache-Control header allowing such objects to be cached for 3600 seconds. If you need to ensure that updates become visible immediately, you should set a Cache-Control header of 'Cache-Control:private, max-age=0, no-transform' on such objects. For help doing this, see the gsutil setmeta command.
    * public-read-write     Gives the bucket owner FULL_CONTROL permission and gives all anonymous users READ and WRITE permission. This ACL applies only to buckets. When you apply this to a bucket, anyone on the Internet can list, create, overwrite and delete objects without authenticating.
    * authenticated-read    Gives the bucket or object owner FULL_CONTROL permission and gives all authenticated Google account holders READ permission.
    * bucket-owner-read     Gives the object owner FULL_CONTROL permission and gives the bucket owner READ permission. This is used only with objects.
    * bucket-owner-full-control Gives the bucket owner FULL_CONTROL permission. This is used only with objects.
    */
    defaultAcl: function (acl, callback) {
      var expiry = new Date(moment().add(1, 'hour').format()).getTime(); // This url should expire in one hour
      var stringPolicy = 'PUT\n' + '\n' + '\n' + expiry + '\n' + 'x-goog-acl:' + acl + '\n' + '/' + storageBucket + '/?defaultObjectAcl'; // Lets put together our policy
      var signature = encodeURIComponent(crypto.createSign('sha256').update(stringPolicy).sign(privateKey,'base64')); // create signature and make it url safe
      var url = 'https://' + storageBucket + '.storage.googleapis.com/?defaultObjectAcl&GoogleAccessId=' + googleServicesEmail + '&Expires=' + expiry + '&Signature=' + signature; // signed url

      rest.put(url, {
        headers: {
          'x-goog-acl': acl
        }
      }).on('complete', function (err, res) {
        if (callback) { callback(); }
      });
    },
    /** Setup Cors
    */
    cors: function (xml, callback) {
      var expiry = new Date(moment().add(1, 'hour').format()).getTime(); // This url should expire in one hour
      var stringPolicy = 'PUT\n' + '\n' + '\n' + expiry + '\n' + '/' + storageBucket + '/?cors'; // Lets put together our policy
      var signature = encodeURIComponent(crypto.createSign('sha256').update(stringPolicy).sign(privateKey,'base64')); // create signature and make it url safe
      var url = 'https://' + storageBucket + '.storage.googleapis.com/?cors&GoogleAccessId=' + googleServicesEmail + '&Expires=' + expiry + '&Signature=' + signature; // signed url

      rest.put(url, {
        data: xml
      }).on('complete', function (err, res) {
        if (callback) { callback(); }
      });
    },
    getCors: function () {
      var expiry = new Date(moment().add(1, 'hour').format()).getTime();  // This url should expire in one hour
      var stringPolicy = 'GET\n' + '\n' + '\n' + expiry + '\n' + '/' + storageBucket + '/?cors'; // Lets put together our policy
      var signature = encodeURIComponent(crypto.createSign('sha256').update(stringPolicy).sign(privateKey,'base64')); // create signature and make it url safe
      var url = 'https://' + storageBucket + '.storage.googleapis.com/?cors&GoogleAccessId=' + googleServicesEmail + '&Expires=' + expiry + '&Signature=' + signature; // signed url

      rest.get(url).on('complete', function (err, res) {
        // console.log(res.rawEncoded);
      });
    },
    /** Check if file exists
    * @param {string} key
    * @param {function} callback
    */
    exists: function (key, callback) {
      rest.get('https://' + storageBucket + '.storage.googleapis.com/' + key + '?v=' + Date.now()).on('complete', function (data, res) {
        callback(res.statusCode != 404);
      });
    },
    /** Get meta data for the given key
    * @param {string} key
    * @param {function} callback
    */
    metaData: function (key, callback) {
      var expiry = new Date(moment().add(1, 'hour').format()).getTime(); // This url should expire in one hour
      var stringPolicy = 'HEAD\n' + '\n' + '\n' + expiry + '\n' + '/' + storageBucket + '/' + key; // Lets put together our policy
      var signature = encodeURIComponent(crypto.createSign('sha256').update(stringPolicy).sign(privateKey,'base64')); // create signature and make it url safe
      var url = 'https://' + storageBucket + '.storage.googleapis.com/' + key + '?GoogleAccessId=' + googleServicesEmail + '&Expires=' + expiry + '&Signature=' + signature; // signed url

      rest.head(url).on('complete', function (err, res) {
        callback(res.headers);
      });
    },
    makePrivate: function (key, callback) {
      this.metaData(key, function (metaData) {
        var expiry = new Date(moment().add(1, 'hour').format()).getTime(); // This url should expire in one hour
        var stringPolicy = 'PUT\n' + '\n' + '\n' + expiry + '\n' +
          'x-goog-acl:bucket-owner-full-control\n' +
          // 'x-goog-if-generation-match:'+metaData['x-goog-generation']+'\n' +
          // 'x-goog-if-metageneration-match:'+metaData['x-goog-metageneration']+'\n' +
          '/' + storageBucket + '/' + key + '?acl'; // Lets put together our policy
          //base64Policy = Buffer(stringPolicy, 'utf-8').toString('base64'), // convert it to Base64
        var signature = encodeURIComponent(crypto.createSign('sha256').update(stringPolicy).sign(privateKey,'base64')); // create signature and make it url safe
        var url = 'https://' + storageBucket + '.storage.googleapis.com/' + key + '?acl&generation=' + metaData['x-goog-generation'] + '&GoogleAccessId=' + googleServicesEmail + '&Expires=' + expiry + '&Signature=' + signature; // signed url

        rest.put(url, {
          headers: {
            // 'x-goog-if-generation-match': metaData['x-goog-generation'],
            // 'x-goog-if-metageneration-match': metaData['x-goog-metageneration'],
            'x-goog-acl': 'bucket-owner-full-control'
          }
        }).on('complete', callback);
      });
    },
    makePublic: function (key, callback) {
      // TODO Maintain Content-Disposition and Content-Type
      this.metaData(key, function (metaData) {
        var expiry = new Date(moment().add(1, 'hour').format()).getTime(); // This url should expire in one hour
        var stringPolicy = 'PUT\n' + '\n' + '\n' + expiry + '\n' +
          'x-goog-acl:public-read\n' +
          '/' + storageBucket + '/' + key + '?acl'; // Lets put together our policy
        var signature = encodeURIComponent(crypto.createSign('sha256').update(stringPolicy).sign(privateKey,'base64')); // create signature and make it url safe
        var url = 'https://' + storageBucket + '.storage.googleapis.com/' + key + '?acl&generation=' + metaData['x-goog-generation'] + '&GoogleAccessId=' + googleServicesEmail + '&Expires=' + expiry + '&Signature=' + signature; // signed url

        rest.put(url, {
          headers: {
            'x-goog-acl': 'public-read'
          }
        }).on('complete', callback);
      });
    },
    getPublicUrl: function (key) {
      return 'https://' + storageBucket + '.storage.googleapis.com/' + key;
    },
    getPrivateUrl: function (key) {
      // As described here: https://developers.google.com/storage/docs/accesscontrol#Signed-URLs
      var expiry = new Date(moment().add(1, 'hour').format()).getTime(); // This url should expire in one hour
      var stringPolicy = 'GET\n' + '\n' + '\n' + expiry + '\n' + '/' + storageBucket + '/' + key; // Lets put together our policy
      var signature = encodeURIComponent(crypto.createSign('sha256').update(stringPolicy).sign(privateKey,'base64')); // create signature and make it url safe
      return 'https://' + storageBucket + '.storage.googleapis.com/' + key +'?GoogleAccessId=' + googleServicesEmail + '&Expires=' + expiry + '&Signature=' + signature;
    },
    remove: function (key, callback) {
      var expiry = new Date(moment().add(1, 'hour').format()).getTime(); // This url should expire in one hour
      var stringPolicy = 'DELETE\n' + '\n' + '\n' + expiry + '\n' + '/' + storageBucket + '/' + key; // Lets put together our policy
      var signature = encodeURIComponent(crypto.createSign('sha256').update(stringPolicy).sign(privateKey,'base64')); // create signature and make it url safe
      var url = 'https://' + storageBucket + '.storage.googleapis.com/' + key + '?GoogleAccessId=' + googleServicesEmail + '&Expires=' + expiry + '&Signature=' + signature; // signed url

      rest.del(url).on('complete', callback);
    },
    /**
    * @param isAttachment When isAttachment is set, accessing the file should force a download prompt.
    * @param customFields {Object} dictionary for custom fields
    */
    uploadRequest: function (filename, key, isAttachment, customFields) {
      var mimeType = mime.lookup(filename);
      var uploadPolicy = {
        'expiration': moment().add(1, 'hour').toISOString(),
        'conditions': [
          {'bucket': storageBucket},
          {'key': key},
          {'Content-Type': mimeType}
        ]
      };

      if(isAttachment) {
        uploadPolicy.conditions.push({
          'Content-Disposition': 'attachment; filename=' + pathLib.basename(filename)
        });
      }
      if(customFields && customFields['Cache-Control']) {
        uploadPolicy.conditions.push({
          'Cache-Control': customFields['Cache-Control']
        });
      }
      _.each(customFields, function (value, field) {
        var customField = {};
        customField['x-goog-meta-' + field] = value;

        uploadPolicy.conditions.push(customField);
      });

      var uploadSignature = crypto.createSign('sha256').update(new Buffer(JSON.stringify(uploadPolicy)).toString('base64')).sign(privateKey,'base64');

      var request = {
        GoogleAccessId: googleServicesEmail,
        key: key,
        'Content-Type': mimeType,
        bucket: storageBucket,
        policy: new Buffer(JSON.stringify(uploadPolicy)).toString('base64'),
        signature: uploadSignature,
      };

      if(isAttachment) {
        request['Content-Disposition'] = 'attachment; filename=' + pathLib.basename(filename);
      }

      if(customFields && customFields['Cache-Control']) {
        request['Cache-Control'] = customFields['Cache-Control'];
      }

      _.each(customFields, function (value, field) {
        request['x-goog-meta-' + field] = value;
      });

      return request;
    },
    upload: function (filename, key, isAttachment, customFields, callback) {
      if (!callback) { callback = function () {}; }
      var uploadRequest = this.uploadRequest(filename, key, isAttachment, customFields);
      uploadRequest.file = rest.file(filename); // Add the file to the upload request

      // multipart request sending a 321567 byte long file using https
      rest.post('https://' + storageBucket + '.storage.googleapis.com/', {
        multipart: true,
        data: uploadRequest
      }).on('complete', function (err, res) {
        callback(res.statusCode == 204 || res.statusCode == 200 ? true : false);
      });
    }
  };
  return storecloud;
};
