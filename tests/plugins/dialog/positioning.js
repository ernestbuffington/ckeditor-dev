/* bender-tags: editor */
/* bender-ckeditor-plugins: dialog, link, toolbar */

( function() {
	'use strict';

	bender.editor = {};

	bender.test( {
		// When dialog is shown body has overflow hidden from class 'cke_dialog_open'
		// and right padding equal to the scrollbars width. When there is predefined right padding
		// it should be preserved. All extra styling is removed on dialog hide (#2395).
		'test body has hidden scrollbars when dialog is opened': function() {
			if ( CKEDITOR.env.ie && !CKEDITOR.env.edge ) {
				assert.ignore();
			}
			var bot = this.editorBot,
				document = CKEDITOR.document,
				body = document.getBody();

			body.appendHtml( '<div style="height:4000px"></div>' );

			bot.dialog( 'link', function( dialog ) {
				assert.isTrue( body.hasClass( 'cke_dialog_open' ), 'Body should have proper class.' );

				dialog.hide();

				assert.isFalse( body.hasClass( 'cke_dialog_open' ), 'Body shouldn\'t have class.' );
			} );
		},
		// Dialog is initially centered by CSS styles:
		// When dialog is shown page is covered by fixed dialog container with `display: flex`.
		// Dialog element doesn't have `position` style, and has `margin: auto` (#2395).
		'test dialog is initially centered': function() {
			if ( CKEDITOR.env.ie && !CKEDITOR.env.edge ) {
				assert.ignore();
			}
			this.editorBot.dialog( 'link', function( dialog ) {
				var container = dialog._.element,
					element = container.getFirst();

				assert.areEqual( container.getStyle( 'display' ), 'flex', 'Dialog container should have `display:flex`.' );
				assert.areEqual( element.getStyle( 'position' ), '', 'Dialog element should\'t have position style.' );
				assert.areEqual( element.getStyle( 'margin' ), 'auto', 'Dialog element should have `margin:auto`.' );

				dialog.hide();
			} );
		},
		'test dialog cover styles': function() {
			this.editorBot.dialog( 'link', function( dialog ) {
				var cover = CKEDITOR.document.findOne( '.cke_dialog_background_cover' );

				assert.areEqual( cover.getStyle( 'width' ), '100%', 'Dialog element should have `width:100%`.' );
				assert.areEqual( cover.getStyle( 'height' ), '100%', 'Dialog element should have `height:100%`.' );

				dialog.hide();
			} );
		},
		// When drag starts, dialog becomes centered with `position:absolute`, then it moves together with mouse (#2395).
		'test dialog move': function() {
			this.editorBot.dialog( 'link', function( dialog ) {
				dialog.parts.title.fire( 'mousedown', {
					$: {
						screenX: 0,
						screenY: 0
					},
					preventDefault: function() {}
				} );

				var element = dialog._.element.getFirst(),
					dialogSize = dialog.getSize(),
					viewPaneSize = CKEDITOR.document.getWindow().getViewPaneSize(),
					expectedX = Math.floor( ( viewPaneSize.width - dialogSize.width ) / 2 ),
					expectedY = Math.floor( ( viewPaneSize.height - dialogSize.height ) / 2 ),
					actualX = parseInt( element.getStyle( 'left' ), 10 ),
					actualY = parseInt( element.getStyle( 'top' ), 10 );

				assert.areEqual( 'absolute', element.getStyle( 'position' ), 'Dialog element should have `position:absolute`.' );
				assert.areEqual( expectedX, actualX, 'Dialog should be horizontally centered.' );
				assert.areEqual( expectedY, actualY, 'Dialog should be vertically centered.' );

				CKEDITOR.document.fire( 'mousemove', {
					$: {
						screenX: 100,
						screenY: 100
					},
					preventDefault: function() {}
				} );

				actualX = parseInt( element.getStyle( 'left' ), 10 );
				actualY = parseInt( element.getStyle( 'top' ), 10 );

				assert.areEqual( 100, actualX - expectedX, 'Dialog should be moved by 100px to the right.' );
				assert.areEqual( 100, actualY - expectedY, 'Dialog should be moved by 100px down.' );

				CKEDITOR.document.fire( 'mouseup' );
				dialog.hide();
			} );
		}
	} );
} )();
