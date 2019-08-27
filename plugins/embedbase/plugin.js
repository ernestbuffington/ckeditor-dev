﻿/**
 * @license Copyright (c) 2003-2019, CKSource - Frederico Knabben. All rights reserved.
 * For licensing, see LICENSE.md or https://ckeditor.com/legal/ckeditor-oss-license
 */

( function() {
	'use strict';

	/**
	 * JSONP communication.
	 *
	 * @private
	 * @singleton
	 * @class CKEDITOR.plugins.embedBase._jsonp
	 */
	var Jsonp = {
		/**
		 * Creates a `<script>` element and attaches it to the document `<body>`.
		 *
		 * @private
		 */
		_attachScript: function( url, errorCallback ) {
			// ATM we cannot use CKE scriptloader here, because it will make sure that script
			// with given URL is added only once.
			var script = new CKEDITOR.dom.element( 'script' );
			script.setAttribute( 'src', url );
			script.on( 'error', errorCallback );

			CKEDITOR.document.getBody().append( script );

			return script;
		},

		/**
		 * Sends a request using the JSONP technique.
		 *
		 * @param {CKEDITOR.template} urlTemplate The template of the URL to be requested. All properties
		 * passed in `urlParams` can be used, plus a `{callback}`, which represents a JSONP callback, must be defined.
		 * @param {Object} urlParams Parameters to be passed to the `urlTemplate`.
		 * @param {Function} callback
		 * @param {Function} [errorCallback]
		 * @returns {Object} The request object with a `cancel()` method.
		 */
		sendRequest: function( urlTemplate, urlParams, callback, errorCallback ) {
			var request = {};
			urlParams = urlParams || {};

			var callbackKey = CKEDITOR.tools.getNextNumber(),
				scriptElement;

			urlParams.callback = 'CKEDITOR._.jsonpCallbacks[' + callbackKey + ']';

			CKEDITOR._.jsonpCallbacks[ callbackKey ] = function( response ) {
				// On IEs scripts are sometimes loaded synchronously. It is bad for two reasons:
				// * nature of sendRequest() is unstable,
				// * scriptElement does not exist yet.
				setTimeout( function() {
					cleanUp();
					callback( response );
				} );
			};

			scriptElement = this._attachScript( urlTemplate.output( urlParams ), function() {
				cleanUp();
				errorCallback && errorCallback();
			} );

			request.cancel = cleanUp;

			function cleanUp() {
				if ( scriptElement ) {
					scriptElement.remove();
					delete CKEDITOR._.jsonpCallbacks[ callbackKey ];
					scriptElement = null;
				}
			}

			return request;
		}
	};

	CKEDITOR.plugins.add( 'embedbase', {
		lang: 'ar,az,bg,ca,cs,da,de,de-ch,en,en-au,eo,es,es-mx,et,eu,fr,gl,hr,hu,id,it,ja,ko,ku,lv,nb,nl,oc,pl,pt,pt-br,ro,ru,sk,sq,sr,sr-latn,sv,tr,ug,uk,zh,zh-cn', // %REMOVE_LINE_CORE%
		requires: 'dialog,widget,notificationaggregator',

		onLoad: function() {
			CKEDITOR._.jsonpCallbacks = {};
		},

		init: function( editor ) {
			editor._.cachedFrameContents = {};

			CKEDITOR.dialog.add( 'embedBase', this.path + 'dialogs/embedbase.js' );
			loadStyles( editor, this );
		}
	} );

	/**
	 * Creates a new embed widget base definition. After other necessary properties are filled this definition
	 * may be {@link CKEDITOR.plugins.widget.repository#add registered} as a new, independent widget for
	 * embedding content.
	 *
	 * By default an embed widget is set up to work with [oEmbed providers](http://www.oembed.com/) using JSONP
	 * requests, such as [Iframely](https://iframely.com/) or [Noembed](https://noembed.com/). It can be,
	 * however, easily configured to use other providers and communication methods, including custom systems
	 * or local embed databases.
	 *
	 * See example usage of this method in:
	 *
	 * * [/plugins/embed/plugin.js](https://github.com/ckeditor/ckeditor-dev/blob/master/plugins/embed/plugin.js)
	 * * [/plugins/embedsemantic/plugin.js](https://github.com/ckeditor/ckeditor-dev/blob/master/plugins/embedsemantic/plugin.js)
	 *
	 * Note that both these plugins reuse the [dialog](https://github.com/ckeditor/ckeditor-dev/blob/master/plugins/embedbase/dialogs/embedbase.js)
	 * defined by the `embedbase` plugin. Integration of the asynchronous way of loading content with a dialog requires additional
	 * effort. Check the dialog's code for more details.
	 *
	 * @static
	 * @param {CKEDITOR.editor} editor
	 * @returns {CKEDITOR.plugins.embedBase.baseDefinition}
	 * @member CKEDITOR.plugins.embedBase
	 */
	function createWidgetBaseDefinition( editor ) {
		var aggregator,
			lang = editor.lang.embedbase;

		/**
		 * An embed widget base definition. It predefines a few {@link CKEDITOR.plugins.widget.definition widget definition}
		 * properties such as {@link #mask}, {@link #template} and {@link #pathName} and adds methods related to
		 * content embedding.
		 *
		 * To create a base definition use the {@link CKEDITOR.plugins.embedBase#createWidgetBaseDefinition} method.
		 *
		 * Note: For easier browsing of this class's API you can hide inherited method using the "Show" drop-down
		 * on the right-hand side.
		 *
		 * @abstract
		 * @class CKEDITOR.plugins.embedBase.baseDefinition
		 * @extends CKEDITOR.plugins.widget.definition
		 */
		return {
			mask: true,
			template: '<div></div>',
			pathName: lang.pathName,

			/**
			 * Response cache. This cache object will be shared between all instances of this widget.
			 *
			 * @private
			 */
			_cache: {},

			/**
			 * A regular expression to pre-validate URLs.
			 *
			 * See:
			 *
			 * * [https://iframely.com/docs/providers],
			 * * {@link #isUrlValid}.
			 */
			urlRegExp: /^((https?:)?\/\/|www\.)/i,

			/**
			 * The template used to generate the URL of the content provider. Content provider is a service
			 * which the embed widget will request in order to get an [oEmbed](http://www.oembed.com/) response that
			 * can be transformed into content which can be embedded in the editor.
			 *
			 * Example content providers are:
			 *
			 * * [Iframely](https://iframely.com/),
			 * * [Noembed](https://noembed.com/).
			 *
			 * Both Iframely and Noembed are **proxy** services which support **JSONP requests**, hence they are not limited by the
			 * same-origin policy. Unfortunately, usually oEmbed services exposed by real content providers
			 * like YouTube or Twitter do not support XHR with CORS or do not support oEmbed at all which makes it
			 * impossible or hard to get such content to be embedded in the editor. This problem is solved by proxy content providers
			 * like Iframely and Noembed.
			 *
			 * This property must be defined after creating an embed widget base definition.
			 *
			 * By default two values are passed to the template:
			 *
			 * * `{url}` &ndash; The URL of the resource to be embedded.
			 * * `{callback}` &ndash; The JSONP callback to be executed.
			 *
			 * Example value:
			 *
			 *		widgetDefinition.providerUrl = new CKEDITOR.template(
			 *			'//ckeditor.iframe.ly/api/oembed?url={url}&callback={callback}'
			 *		);
			 *
			 * @property {CKEDITOR.template} providerUrl
			 */

			init: function() {
				this.on( 'sendRequest', function( evt ) {
					this._sendRequest( evt.data );
				}, this, null, 999 );

				// Expose the widget in the dialog - needed to trigger loadContent() and do error handling.
				this.on( 'dialog', function( evt ) {
					evt.data.widget = this;
				}, this );

				this.on( 'handleResponse', function( evt ) {
					if ( evt.data.html ) {
						return;
					}

					var retHtml = this._responseToHtml( evt.data.url, evt.data.response );

					if ( retHtml !== null ) {
						evt.data.html = retHtml;
					} else {
						evt.data.errorMessage = 'unsupportedUrl';
						evt.cancel();
					}
				}, this, null, 999 );

				this.once( 'ready', function() {
					var url = this.data.url;

					if ( !url ) {
						return;
					}

					var that = this;

					if ( !CKEDITOR.env.ie ) {
						this.appendIframe().then( function( iframe ) {
							if ( !iframe.hasAttribute( 'src' ) ) {
								var documentElement = iframe && iframe.getFrameDocument().getDocumentElement(),
									contents = getCachedFrameContents( editor, url ),
									response;

								if ( contents ) {
									cacheFrameContents( editor, url, documentElement );
									that.element.setAttribute( 'data-restore-html', true );
									restoreContents( documentElement, contents, that );
								} else if ( response = that._getCachedResponse( url ) ) {
									that.addContent( response.html );
								} else {
									that.loadContent( url, {
										noNotifications: true
									} );
								}
							}
						} );
					} else if ( this.element.hasAttribute( 'data-cke-get-responmse' ) ) {
						that.loadContent( url, {
							noNotifications: true
						} );
					}
				} );
			},

			/**
			 * Appends an iframe to this widget, and returns promise which resolves with the iframe.
			 * Because some browsers needs iframe#onload, it's wrapped with the promise.
			 *
			 * @returns {CKEDITOR.tools.promise<CKEDITOR.dom.element>} Returns the promise wrapping iframe.
			 */
			appendIframe: function() {
				var iframe = this.element.findOne( 'iframe' );

				if ( !iframe ) {
					iframe = this.editor.editable().getDocument().createElement( 'iframe' );

					iframe.setAttributes( {
						width: '100%',
						height: '300',
						frameborder: '0'
					} );

					this.editor.fire( 'lockSnapshot' );

					this.element.setHtml( '' );
					this.element.append( iframe );
					this.setData( 'store-contents', true );

					this.editor.fire( 'unlockSnapshot' );
				}

				var useOnloadEvent = ( CKEDITOR.env.ie && !CKEDITOR.env.edge ) || CKEDITOR.env.gecko;

				if ( !useOnloadEvent ) {
					return CKEDITOR.tools.promise.resolve( iframe );
				}

				var promise = new CKEDITOR.tools.promise( function( res ) {
					iframe.once( 'load', function() {
						res( iframe );
					} );
				} );

				return promise;
			},

			addContent: function( content ) {
				var that = this;

				this.appendIframe().then( function( iframe ) {
					var frameDocument = iframe.getFrameDocument(),
						frameBody = frameDocument.getBody(),
						frameHead = frameDocument.getHead(),
						scriptUrl = content.match( /<script.*src="([^"]*)/ ),
						style = frameDocument.createElement( 'style' );

					cacheFrameContents( editor, that.data.url, frameDocument.getDocumentElement() );

					scriptUrl = scriptUrl && scriptUrl[ 1 ];

					style.setHtml(
						'html, body {' +
						'height: 100%;' +
						'}' +
						'body {' +
						'position: relative;' +
						'display: block;' +
						'margin: 0;' +
						'background: none transparent;' +
						'overflow: hidden;' +
						'}' +
						'object, embed, iframe {' +
						'margin: 0;' +
						'padding: 0;' +
						'background: white;' +
						'color: white;' +
						'}'
					);

					frameHead.append( style );

					content = content.replace( /<script(.|\n)*?<\/script>/gmi, '' );

					var container = new CKEDITOR.dom.element( 'div', frameDocument ),
						script = frameDocument.createElement( 'script' );

					container.setHtml( content );

					frameBody.append( container );

					script.setAttribute( 'src', scriptUrl );

					frameBody.append( script );

					// Mark that element html needs to be restored on downcast (#2306).
					that.element.setAttribute( 'data-restore-html', true );

					that.addResizeListener();
				} );
			},

			addResizeListener: function() {
				var iframe = this.element.findOne( 'iframe' ),
					frameDocument = iframe.getFrameDocument(),
					frameBody = frameDocument.getBody(),
					container = frameBody.findOne( 'div' ),
					editor = this.editor,
					lastContentElementHeight;

				resize();

				// When inverval is hosted in iframe window it will only last as long as window is attached, so no need for manual cleanup.
				frameDocument.getWindow().$.setInterval( function() {
					var elHeight = container.$.scrollHeight;

					if ( elHeight != lastContentElementHeight ) {
						lastContentElementHeight = elHeight;
						resize();
					}
				}, 200 );

				function resize() {
					// Prevent editor from saving new snapshots each time iframe height is adjusted.
					editor.fire( 'lockSnapshot' );

					iframe.setAttribute( 'height', getHeight() );

					editor.fire( 'unlockSnapshot' );
					editor.fire( 'updateSnapshot' );

				}

				function getHeight() {
					var elHeight = container.$.scrollHeight,
						docHeight = frameBody.$.scrollHeight;
					return ( elHeight < docHeight && elHeight > 0 ) ? elHeight : docHeight;
				}
			},

			/**
			 * Loads content for a given resource URL by requesting the {@link #providerUrl provider}.
			 *
			 * Usually widgets are controlled by the {@link CKEDITOR.plugins.widget#setData} method. However,
			 * loading content is an asynchronous operation due to client-server communication, and it would not
			 * be possible to pass callbacks to the {@link CKEDITOR.plugins.widget#setData} method so this new method
			 * is defined for embed widgets.
			 *
			 * This method fires two events that allow to customize widget behavior without changing its code:
			 *
			 * * {@link #sendRequest},
			 * * {@link #handleResponse} (if the request was successful).
			 *
			 * Note: This method is always asynchronous, even if the cache was hit.
			 *
			 * Example usage:
			 *
			 *		var url = 'https://twitter.com/reinmarpl/status/573118615274315776';
			 *		widget.loadContent( url, {
			 *			callback: function() {
			 *				// Success. It is a good time to save a snapshot.
			 *				editor.fire( 'saveSnapshot' );
			 *				console.log( widget.data.url ); // The above URL. It is only changed
			 *												// once the content is successfully loaded.
			 *			},
			 *
			 *			errorCallback: function( message ) {
			 *				editor.showNotification( widget.getErrorMessage( message, url ), 'warning' );
			 *			}
			 *		} );
			 *
			 * @param {String} url Resource URL to be embedded.
			 * @param {Object} opts
			 * @param {Function} [opts.callback] Callback called when content was successfully loaded into the editor.
			 * @param {Function} [opts.errorCallback] Callback called when an error occurred.
			 * @param {String} opts.errorCallback.messageTypeOrMessage See {@link #getErrorMessage}.
			 * @param {Boolean} [opts.noNotifications] Do not show notifications (useful when the dialog is open).
			 * @returns {CKEDITOR.plugins.embedBase.request}
			 */
			loadContent: function( url, opts ) {
				opts = opts || {};

				var that = this,
					cachedResponse = this._getCachedResponse( url ),
					request = {
						noNotifications: opts.noNotifications,
						url: url,
						callback: finishLoading,
						errorCallback: function( msg ) {
							that._handleError( request, msg );
							if ( opts.errorCallback ) {
								opts.errorCallback( msg );
							}
						}
					};

				if ( cachedResponse ) {
					// Keep the async nature (it caused a bug the very first day when the loadContent()
					// was synchronous when cache was hit :D).
					setTimeout( function() {
						finishLoading( cachedResponse );
					} );
					return;
				}

				if ( !opts.noNotifications ) {
					request.task = this._createTask();
				}

				// The execution will be followed by #sendRequest's listener.
				this.fire( 'sendRequest', request );

				function finishLoading( response ) {
					request.response = response;

					// Check if widget is still valid.
					if ( !that.editor.widgets.instances[ that.id ] ) {
						CKEDITOR.warn( 'embedbase-widget-invalid' );

						if ( request.task ) {
							request.task.done();
						}

						return;
					}

					if ( that._handleResponse( request ) ) {
						that._cacheResponse( url, response );
						if ( opts.callback ) {
							opts.callback();
						}
						if ( !CKEDITOR.env.ie ) {
							that.addContent( response.html );
						}
					}
				}

				return request;
			},

			/**
			 * Checks whether the URL is valid. Usually the content provider makes the final validation
			 * as only the provider knows what kind of URLs are accepted. However, to give the user some immediate feedback
			 * a synchronous validation is performed using the {@link #urlRegExp} pattern and the {@link #validateUrl} event.
			 *
			 * @param {String} url The URL to check.
			 * @returns {Boolean} Whether the URL is valid (supported).
			 */
			isUrlValid: function( url ) {
				return this.urlRegExp.test( url ) && this.fire( 'validateUrl', url ) !== false;
			},

			/**
			 * Generates an error message based on the message type (with a possible suffix) or
			 * the custom message template.
			 *
			 * This method is used when showing a notification or an alert (in a dialog) about an error.
			 * Usually it is used with an error type which is a string from the `editor.lang.embedbase` object.
			 *
			 * There are two error types available at the moment: `'unsupportedUrl'` and `'fetchingFailed'`.
			 * Additionally, both can be suffixed with `'Given'`. See the language entries to see the difference.
			 * Inside the dialog this method is used with a suffix and to generate a notification message it is
			 * used without a suffix.
			 *
			 * Additionally, a custom message may be passed and just like language entries, it can use the `{url}`
			 * placeholder.
			 *
			 * While {@link #handleResponse handling the response} you can set an error message or its type. It will
			 * be passed to this method later.
			 *
			 *		widget.on( 'handleResponse', function( evt ) {
			 *			if ( evt.data.response.type != 'rich' ) {
			 *				evt.data.errorMessage = '{url} cannot be embedded. Only rich type is supported.';
			 *				evt.cancel();
			 *
			 *				// Or:
			 *				evt.data.errorMessage = 'unsupportedUrl.';
			 *				evt.cancel();
			 *			}
			 *		} );
			 *
			 * If you need to display your own error:
			 *
			 *		editor.showNotification(
			 *			widget.getErrorMessage( '{url} cannot be embedded. Only rich type is supported.', wrongUrl )
			 *		);
			 *
			 * Or with a message type:
			 *
			 *		editor.showNotification(
			 *			widget.getErrorMessage( 'unsupportedUrl', wrongUrl )
			 *		);
			 *
			 * @param {String} messageTypeOrMessage
			 * @param {String} [url]
			 * @param {String} [suffix]
			 * @returns {String}
			 */
			getErrorMessage: function( messageTypeOrMessage, url, suffix ) {
				var message = editor.lang.embedbase[ messageTypeOrMessage + ( suffix || '' ) ];
				if ( !message ) {
					message = messageTypeOrMessage;
				}

				return new CKEDITOR.template( message ).output( { url: url || '' } );
			},

			/**
			 * Sends the request to the {@link #providerUrl provider} using
			 * the {@link CKEDITOR.plugins.embedBase._jsonp JSONP} technique.
			 *
			 * @private
			 * @param {CKEDITOR.plugins.embedBase.request} request
			 */
			_sendRequest: function( request ) {
				var that = this,
					jsonpRequest = Jsonp.sendRequest(
						this.providerUrl,
						{
							url: encodeURIComponent( request.url )
						},
						request.callback,
						function() {
							request.errorCallback( 'fetchingFailed' );
						}
					);

				request.cancel = function() {
					jsonpRequest.cancel();
					that.fire( 'requestCanceled', request );
				};
			},

			/**
			 * Handles the response of a successful request.
			 *
			 * Fires the {@link #handleResponse} event in order to convert the oEmbed response
			 * to HTML that can be embedded.
			 *
			 * If the response can be handled, the {@link #_setContent content is set}.
			 *
			 * @private
			 * @param {CKEDITOR.plugins.embedBase.request} request
			 * @returns {Boolean} Whether the response can be handled. Returns `false` if {@link #handleResponse}
			 * was canceled or the default listener could not convert oEmbed response into embeddable HTML.
			 */
			_handleResponse: function( request ) {
				var evtData = {
					url: request.url,
					html: '',
					response: request.response
				};

				if ( this.fire( 'handleResponse', evtData ) !== false ) {
					if ( request.task ) {
						request.task.done();
					}

					var content;

					if ( CKEDITOR.env.ie ) {
						// Try to recreate widget content when needed (#2306).
						content = this._generateContent( request.response );
					}

					if ( content ) {
						// Mark that element html needs to be restored on downcast (#2306).
						this.element.setAttribute( 'data-restore-html', 'true' );
					} else {
						content = evtData.html;
					}

					this._setContent( request.url, content );

					return true;
				} else {
					request.errorCallback( evtData.errorMessage );
					return false;
				}
			},

			/**
			 * Handles an error. An error can be caused either by a request failure or an unsupported
			 * oEmbed response type.
			 *
			 * @private
			 * @param {CKEDITOR.plugins.embedBase.request} request
			 * @param {String} messageTypeOrMessage See {@link #getErrorMessage}.
			 */
			_handleError: function( request, messageTypeOrMessage ) {
				if ( request.task ) {
					request.task.cancel();

					if ( !request.noNotifications ) {
						editor.showNotification( this.getErrorMessage( messageTypeOrMessage, request.url ), 'warning' );
					}
				}
			},

			/**
			 * Returns embeddable HTML for an oEmbed response if it is of the `photo`, `video` or `rich` type.
			 *
			 * @private
			 * @param {Object} response The oEmbed response.
			 * @returns {String/null} HTML string to be embedded or `null` if this response type is not supported.
			 */
			_responseToHtml: function( url, response ) {
				if ( response.type == 'photo' ) {
					return '<img src="' + CKEDITOR.tools.htmlEncodeAttr( response.url ) + '" ' +
						'alt="' + CKEDITOR.tools.htmlEncodeAttr( response.title || '' ) + '" style="max-width:100%;height:auto" />';
				} else if ( response.type == 'video' || response.type == 'rich' ) {
					// Embedded iframes are added to page's focus list. Adding negative tabindex attribute
					// removes their ability to be focused by user. (https://dev.ckeditor.com/ticket/14538)
					response.html = response.html.replace( /<iframe/g, '<iframe tabindex="-1"' );

					return response.html;
				}

				return null;
			},

			/**
			 * The very final step of {@link #loadContent content loading}. The `url` data property is changed
			 * and the content is embedded ({@link CKEDITOR.plugins.widget#element}'s HTML is set).
			 *
			 * @private
			 * @param {String} url The resource URL.
			 * @param {String} content HTML content to be embedded.
			 */
			_setContent: function( url, content ) {
				this.setData( 'url', url );
				this.element.setHtml( content );
			},

			/**
			 * Given response returns html code that represents url card preview.
			 *
			 * @since 4.13.0
			 * @static
			 * @private
			 * @param {Object} response Request response.
			 * @returns {String} Html string to be inserted in widget.
			 */
			_generateContent: function( response ) {
				var scriptUrl = /<script.*?src="(.*?)"/.exec( response.html );
				scriptUrl = scriptUrl && scriptUrl[ 1 ];

				var canUseOriginalContent = scriptUrl !== '//if-cdn.com/embed.js';

				if ( canUseOriginalContent ) {
					return null;
				}

				var providerName = response.provider_name;

				// When there is no provider name, try to recreate it from an url.
				// Example: 'http://wwww.some-site.example.com/subsite/document?query' extracted 'some-site.example.com'.
				if ( !providerName ) {
					providerName = /\/\/(www\.)?(.*?)(\/|$)/.exec( response.url );
					providerName = providerName && providerName[ 2 ];
				}

				// Height style is present in response only for compact widgets.
				var thumbnailClass = 'cke_widget_embed_thumbnail',
					isCompact = /style="height/.test( response.html );

				if ( isCompact ) {
					thumbnailClass += ' cke_widget_embed_compact';
				}

				var captionContent = '';

				captionContent += response.title ? '<p class="cke_widget_embed_title">' + response.title + '</p>' : '';

				captionContent += response.description ? '<p class="cke_widget_embed_description">' + response.description + '</p>' : '';

				captionContent += providerName ?
					'<p class="cke_widget_embed_provider">' +
						'<img class="cke_widget_embed_favicon" ' +
							// Favicon is missing in response, with little help of Google we can retrieve it.
							'src="https://www.google.com/s2/favicons?domain=' + encodeURIComponent( response.url ) + '" ' +
							'onerror="this.style.display=\'none\'">' +
						providerName +
					'</p>' : '';

				if ( captionContent ) {
					var openingTag = response.thumbnail_url ?
						'<figcaption class="cke_widget_embed_caption">' :
						'<div class="cke_widget_embed_container cke_widget_embed_caption">';

					captionContent = openingTag + captionContent;
				}

				var newContent = response.thumbnail_url ?
					'<figure class="cke_widget_embed_container"><img class="' + thumbnailClass + '" src="' + response.thumbnail_url + '">' : '';

				newContent += captionContent;

				if ( captionContent ) {
					newContent += response.thumbnail_url ? '</figcaption>' : '</div>';
				}

				newContent += response.thumbnail_url ? '</figure>' : '';

				return newContent || null;
			},

			/**
			 * Creates a notification aggregator task.
			 *
			 * @private
			 * @returns {CKEDITOR.plugins.notificationAggregator.task}
			 */
			_createTask: function() {
				if ( !aggregator || aggregator.isFinished() ) {
					aggregator = new CKEDITOR.plugins.notificationAggregator( editor, lang.fetchingMany, lang.fetchingOne );

					aggregator.on( 'finished', function() {
						aggregator.notification.hide();
					} );
				}

				return aggregator.createTask();
			},

			/**
			 * Caches the provider response.
			 *
			 * @private
			 * @param {String} url
			 * @param {Object} response
			 */
			_cacheResponse: function( url, response ) {
				this._cache[ url ] = response;
			},

			/**
			 * Returns the cached response.
			 *
			 * @private
			 * @param {String} url
			 * @returns {Object/undefined} Response or `undefined` if the cache was missed.
			 */
			_getCachedResponse: function( url ) {
				return this._cache[ url ];
			}
		};

		/**
		 * Fired by the {@link #isUrlValid} method. Cancel the event to make the URL invalid.
		 *
		 * @event validateUrl
		 * @param {String} data The URL being validated.
		 */

		/**
		 * Fired by the {@link #loadContent} method to dispatch a request to the provider.
		 * You can cancel this event and send the request using a different technique.
		 * By default, if the event is not stopped or canceled a request will be sent
		 * using the JSONP technique.
		 *
		 *		widget.on( 'sendRequest', function( evt ) {
		 *			var request = evt.data;
		 *
		 *			// Send the request using a technique of your choice (XHR with CORS for instance).
		 *			myApp.requestOembedProvider( request.url, function( err, response ) {
		 *				if ( err ) {
		 *					request.errorCallback( err );
		 *				} else {
		 *					request.callback( response );
		 *				}
		 *			} );
		 *
		 *			// Do not call other listeners, so the default behavior (JSONP request)
		 *			// will not be executed.
		 *			evt.stop();
		 *		} );
		 *
		 * @event sendRequest
		 * @param {CKEDITOR.plugins.embedBase.request} data
		 */

		/**
		 * Fired after receiving a response from the {@link #providerUrl provider}.
		 * This event listener job is to turn the oEmbed response to embeddable HTML by setting
		 * `evt.data.html`.
		 *
		 *		widget.on( 'handleReaponse', function( evt ) {
		 *			evt.data.html = customOembedToHtmlConverter( evt.data.response );
		 *		} );
		 *
		 * This event can also be canceled to indicate that the response cannot be handled. In such
		 * case the `evt.data.errorMessage` must be set (see {@link #getErrorMessage}).
		 *
		 *		widget.on( 'handleReaponse', function( evt ) {
		 *			if ( evt.data.response.type == 'photo' ) {
		 *				// Will display the editor.lang.embedbase.unsupportedUrl(Given) message.
		 *				evt.data.errorMessage = 'unsupportedUrl';
		 *				evt.cancel();
		 *			}
		 *		} );
		 *
		 * This event has a default late-listener (with a priority of `999`) that, if `evt.data.html` has not
		 * been set yet, will try to handle the response by using the {@link #_responseToHtml} method.
		 *
		 * @event handleResponse
		 * @param {Object} data
		 * @param {String} data.url The resource URL.
		 * @param {Object} data.response The oEmbed response.
		 * @param {String} [data.html=''] The HTML which will be embedded.
		 * @param {String} [data.errorMessage] The error message or message type (see {@link #getErrorMessage})
		 * that must be set if this event is canceled to indicate an unsupported oEmbed response.
		 */
	}

	/**
	 * Class representing the request object. It is created by the {@link CKEDITOR.plugins.embedBase.baseDefinition#loadContent}
	 * method and is passed to other methods and events of this class.
	 *
	 * @abstract
	 * @class CKEDITOR.plugins.embedBase.request
	 */

	/**
	 * The resource URL to be embedded (not the {@link CKEDITOR.plugins.embedBase.baseDefinition#providerUrl provider URL}).
	 *
	 * @property {String} url
	 */

	/**
	 * Success callback to be executed once a response to a request is received.
	 *
	 * @property {Function} [callback]
	 * @param {Object} response The response object.
	 */

	/**
	 * Callback executed in case of an error.
	 *
	 * @property {Function} [errorCallback]
	 * @param {String} messageTypeOrMessage See {@link CKEDITOR.plugins.embedBase.baseDefinition#getErrorMessage}.
	 */

	/**
	 * Task that should be resolved once the request is done.
	 *
	 * @property {CKEDITOR.plugins.notificationAggregator.task} [task]
	 */

	/**
	 * Response object. It is set once a response is received.
	 *
	 * @property {Object} [response]
	 */

	/**
	 * Cancels the request.
	 *
	 * @method cancel
	 */

	CKEDITOR.plugins.embedBase = {
		createWidgetBaseDefinition: createWidgetBaseDefinition,
		_jsonp: Jsonp
	};

	var stylesLoaded;

	function loadStyles( editor, plugin ) {
		var localPath = 'styles/embedbase.css';

		if ( !stylesLoaded ) {
			CKEDITOR.document.appendStyleSheet( plugin.path + localPath );
			stylesLoaded = true;
		}

		if ( editor.addContentsCss ) {
			editor.addContentsCss( plugin.path + localPath );
		}
	}

	function cacheFrameContents( editor, url, element ) {
		var cache = editor._.cachedFrameContents[ url ];

		if ( !cache ) {
			cache = editor._.cachedFrameContents[ url ] = [];
		}

		cache.push( element );
	}

	function getCachedFrameContents( editor, url ) {
		var cache = editor._.cachedFrameContents[ url ];

		if ( !cache ) {
			return null;
		}

		var contents = CKEDITOR.tools.array.find( cache, isDetached );

		if ( !contents ) {
			return null;
		}

		var index = CKEDITOR.tools.array.indexOf( cache, contents );

		// Contents must be used to create new cached element, so this one is removed from cache.
		cache.splice( index, 1 );

		return contents;
	}

	function restoreContents( parent, contents, widget ) {
		removeChildren( parent );

		CKEDITOR.tools.array.forEach( contents.getChildren().toArray(), function( element ) {
			parent.append( element );
		} );

		// We can't check if widget is fully initialized before downcasting,
		// so we need to restore scripts and resize listener, to let it finish loading.
		restoreScripts( parent.getDocument().getBody() );

		widget.addResizeListener();
	}

	function removeChildren( parent ) {
		var child;
		while ( child = parent.getFirst() ) {
			child.remove();
		}
	}

	function restoreScripts( element ) {
		CKEDITOR.tools.array.forEach( element.find( 'script' ).toArray(), function( scriptEl ) {
			var parent = scriptEl.getParent(),
				src = scriptEl.getAttribute( 'src' );

			scriptEl.remove();
			scriptEl = new CKEDITOR.dom.element( 'script', parent.getDocument() );
			scriptEl.setAttribute( 'src', src );

			parent.append( scriptEl );
		} );
	}

	function isDetached( element ) {
		var window = !element.getDocument().getWindow();

		if ( !window.$ ) {
			return true;
		}

		var el = window.getFrame();
		return el.getDocument().getDocumentElement().contains( el );
	}
} )();
