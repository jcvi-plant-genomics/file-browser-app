/*global jQuery, _*/
(function(window, $, _, undefined) {
  'use strict';

  // ES6-style promises
  window.ES6Promise.polyfill();

  var $appContext = $('[data-app-name="file-browser-app"]');
  var templates = {};
  var Agave;
  var currentUser;
  var currentSystemId;
  var currentFiles;
  var currentPath;

  templates.systems = _.template('<option value="">Choose a system to browse</option><% _.each(systems, function(system) { %><option value="<%= system.id %>">(<%= system.id %>) <%= system.name %></option><% }); %>');
  templates.files = _.template(
    '<% _.each(files, function(file, i) { %><tr data-file-index="<%= i %>"><td><%= file.name %></td>'+
    '<td><i class="fa fa-<%= file.type === \'dir\' ? \'folder\' : \'file\' %>"></i> <%= file.mimeType %></td>' +
    '<td><%= niceFileSize(file.length) %></td><td>'+
    '<% if (file.type === \'file\') { %>' +
    '<button title="Download" name="download" class="btn btn-xs btn-primary"><i class="fa fa-cloud-download"></i><span class="sr-only">Download</span></button> '+
    '<button title="Delete" name="delete" class="btn btn-xs btn-danger"><i class="fa fa-times"></i><span class="sr-only">Delete</span></button> '+
    '<% } else if (file.type === \'dir\'){%>' +
    '<button title="Open" name="open" class="btn btn-xs btn-default"><i class="fa fa-folder-open"></i><span class="sr-only">Open</span></button> '+
    '<% } %></td></tr><% }); %>');
  templates.displayPath = _.template('<% _.each(parts, function(part) { %><a href="#<%= part.path %>"><%= part.name %></a>/<% })%>');

  var nextSuffix = {
    'bytes': 'KB',
    'KB': 'MB',
    'MB': 'GB',
    'GB': 'TB',
    'TB': 'PB'
  };
  function niceFileSize(size, suffix) {
    suffix = suffix || 'bytes';
    if (size > 1024 && nextSuffix[suffix]) {
      return niceFileSize( size / 1024, nextSuffix[suffix]);
    } else {
      return size.toFixed(2) + ' ' + suffix;
    }

  }

  function indicator(opts) {
    opts = opts || {};
    if (opts.show) {
      $('.indicator', $appContext).addClass('show');
    } else {
      $('.indicator', $appContext).removeClass('show');
    }
  }

  function init(systems) {
    $('select[name="system"]', $appContext)
    .html(templates.systems({ systems: systems }))
    .on('change', function() {
      selectSystem(this.value);
    });
  }

  function selectSystem(systemId) {
    currentSystemId = systemId;
    openPath( currentUser.username );
  }

  function displayFiles(files) {
    if ( files[0].name === '.' && files[0].path.indexOf('/') !== -1 ) {
      files[0].name = '..';
      files[0].path = files[0].path.substring( 0, files[0].path.lastIndexOf( '/' ) );
    }
    currentFiles = files;
    $('.display-files', $appContext).html( templates.files( { files: currentFiles, niceFileSize: niceFileSize } ) );

    $('.path', $appContext).html( templates.displayPath( {
      parts: _.map( currentPath.split( '/' ), function(part) {
        return {
          name: part,
          path: currentPath.substring( 0, (currentPath.indexOf( part ) + part.length) )
        };
      } )
    } ) );
    $('.path a', $appContext).on('click', function(e) {
      e.preventDefault();
      openPath( e.currentTarget.hash.substring( 1 ) );
    });
    $('button[name="open"]', $appContext).on( 'click', function(e) {
      e.preventDefault();
      var fileIndex = parseInt($(e.currentTarget).closest('tr').attr('data-file-index'));
      openPath( currentFiles[fileIndex].path );
    } );
  }

  function openPath(path) {
    currentPath = path;
    indicator({show:true});
    new Promise(function( res, rej ) {
      Agave.api.files.list({ systemId: currentSystemId, filePath: currentPath }, function(resp) {
        res(resp.obj.result);
      }, rej);
    })
    .then(displayFiles)
    .then(indicator);
  }

  /* Generate Agave API docs */
  window.addEventListener('Agave::ready', function() {
    Agave = window.Agave;

    indicator({show: true});

    Agave.api.profiles.me({}, function(resp) {
      currentUser = resp.obj.result;
    });

    new Promise( function( res, rej ) {
      Agave.api.systems.list({}, function(resp) {
        res(_.filter(resp.obj.result, { 'type': 'STORAGE' }));
      }, rej);
    })
    .then(init)
    .then(indicator);
  });

})(window, jQuery, _);
