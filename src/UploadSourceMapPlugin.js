import async from 'async';
import request from 'request';
import VError from 'verror';
import find from 'lodash.find';
import reduce from 'lodash.reduce';
import { handleError, validateOptions } from './helpers';
import { ENDPOINT } from './constants';

class UploadSourceMapPlugin {
    constructor({
                    apiKey,
                    projectId,
                    publicPath,
                    silent = false,
                    ignoreErrors = false
                }) {
        this.apiKey = apiKey;
        this.publicPath = publicPath;
        this.projectId = projectId;
        // this.includeChunks = [].concat(includeChunks);
        this.silent = silent;
        this.ignoreErrors = ignoreErrors;
    }

    afterEmit(compilation, cb) {
        const errors = validateOptions(this);

        if (errors) {
            compilation.errors.push(...handleError(errors));
            return cb();
        }

        this.uploadSourceMaps(compilation, (err) => {
            if (err) {
                if (!this.ignoreErrors) {
                    compilation.errors.push(...handleError(err));
                } else if (!this.silent) {
                    compilation.warnings.push(...handleError(err));
                }
            }
            cb();
        });
    }

    apply(compiler) {
        compiler.plugin('after-emit', this.afterEmit.bind(this));
    }

    getAssets(compilation) {
        const { includeChunks } = this;
        const { chunks } = compilation.getStats().toJson();

        return reduce(chunks, (result, chunk) => {
            const chunkName = chunk.names[0];
            if (includeChunks.length && includeChunks.indexOf(chunkName) === -1) {
                return result;
            }

            const sourceFile = find(chunk.files, file => /\.js$/.test(file));
            const sourceMap = find(chunk.files, file => /\.js\.map$/.test(file));

            if (!sourceFile || !sourceMap) {
                return result;
            }

            return [
                ...result,
                { sourceFile, sourceMap }
            ];
        }, {});
    }

    uploadSourceMap(compilation, { sourceFile, sourceMap }, cb) {

        const url = ENDPOINT.replace('[id]', this.projectId);

        console.log('UploadSourceMapPlugin to:', url);

        const req = request
            .post(url, (err, res, body) => {
                if (!err && res.statusCode === 200) {
                    if (!this.silent) {
                        console.info(`Uploaded ${sourceMap} `); // eslint-disable-line no-console
                    }
                    return cb();
                }

                const errMessage = `failed to upload ${sourceMap}`;
                if (err) {
                    return cb(new VError(err, errMessage));
                }

                try {
                    const { message } = JSON.parse(body);
                    return cb(new Error(message ? `${errMessage}: ${message}` : errMessage));
                } catch (parseErr) {
                    return cb(new VError(parseErr, errMessage));
                }
            })
            .auth(null, null, true, this.apiKey);


        const form = req.form();
        // form.append('access_token', this.accessToken);
        // form.append('version', this.version);
        form.append('name', `${this.publicPath}/${sourceFile}`);
        form.append('file', compilation.assets[sourceMap].source());
    }

    uploadSourceMaps(compilation, cb) {
        const assets = this.getAssets(compilation);
        const upload = this.uploadSourceMap.bind(this, compilation);

        async.each(assets, upload, (err, results) => {
            if (err) {
                return cb(err);
            }
            return cb(null, results);
        });
    }
}

module.exports = UploadSourceMapPlugin;
