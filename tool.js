var fs = require('fs');
var path = require('path');
var crypto = require('crypto');
var gutil = require('gulp-util');
var AWS = require('aws-sdk');
var Q = require('q');
var gutil = require('gulp-util');

var PLUGIN_NAME = 'gulp-cloudfront';

module.exports = function(options) {

    var credentials = getCredentials(options);
    if (credentials instanceof Error) {
      throw credentials;
    }

    var cloudfront = new AWS.CloudFront(credentials);

    var updateDefaultRootObject = function (defaultRootObject) {

        var deferred = Q.defer();

        // Get the existing distribution id
        cloudfront.getDistribution({ Id: options.distributionId }, function(err, data) {

            if (err) {
                deferred.reject(err);
            } else {

                // AWS Service returns errors if we don't fix these
                if (data.DistributionConfig.Comment === null) data.DistributionConfig.Comment = '';
                if (data.DistributionConfig.Logging.Enabled === false) {
                    data.DistributionConfig.Logging.Bucket = '';
                    data.DistributionConfig.Logging.Prefix = '';
                }

                // Causing problems on a default cloudfront setup, why is this needed?
                if (data.DistributionConfig.Origins.Items instanceof Array && data.DistributionConfig.Origins.Items[0].S3OriginConfig && data.DistributionConfig.Origins.Items[0].S3OriginConfig.OriginAccessIdentity === null) {
                    data.DistributionConfig.Origins.Items[0].S3OriginConfig.OriginAccessIdentity = '';
                }

                if (data.DistributionConfig.DefaultRootObject === defaultRootObject.substr(1)) {
                    gutil.log('gulp-cloudfront:', "DefaultRootObject hasn't changed, not updating.");
                    return deferred.resolve();
                }

                // Update the distribution with the new default root object (trim the precedeing slash)
                data.DistributionConfig.DefaultRootObject = defaultRootObject.substr(1);

                cloudfront.updateDistribution({
                    IfMatch: data.ETag,
                    Id: options.distributionId,
                    DistributionConfig: data.DistributionConfig
                }, function(err, data) {

                    if (err) {
                        deferred.reject(err);
                    } else {
                        gutil.log('gulp-cloudfront:', 'DefaultRootObject updated to [' + defaultRootObject.substr(1) + '].');
                        deferred.resolve();
                    }

                });

            }
        });

        return deferred.promise;

    };

    return {
        updateDefaultRootObject: updateDefaultRootObject
    };

};



/**
 * Hunt for appropriate creds
 * @param {Options} opts
 *
 * @return {Credentials} obj
 * @api private
 */

function getCredentials(opts) {
  if (opts && opts instanceof AWS.SharedIniFileCredentials && !opts.accessKeyId) {
    return new gutil.PluginError({
      plugin: PLUGIN_NAME,
      message: 'Bad or invalid credentials'
    });
  }

  // compatibility
  if (opts && opts.key && (opts.secret || opts.token)) {
    return {
      accessKeyId: opts.key,
      secretAccessKey: opts.secret,
      sessionToken: opts.token
    };
  }

  // When passing to S3, the non-enumerated secretKey won't get copied
  if (opts && opts instanceof AWS.SharedIniFileCredentials) {
    return {
      accessKeyId: opts.accessKeyId,
      secretAccessKey: opts.secretAccessKey,
      sessionToken: opts.sessionToken
    };
  }

  if (opts && opts.accessKeyId && (opts.secretAccessKey || opts.sessionToken)) {
    return {
      accessKeyId: opts.accessKeyId,
      secretAccessKey: opts.secretAccessKey,
      sessionToken: opts.sessionToken
    };
  }

  if (AWS.config.credentials) {
    return getCredentials(AWS.config.credentials);
  }

  return getCredentials(new AWS.SharedIniFileCredentials(opts));
}
