/*global jQuery, _*/
(function(window, $, _, undefined) {
  'use strict';

  // ES6-style promises
  window.ES6Promise.polyfill();

  var $appContext = $('[data-app-name="file-browser-app"]');
  var templates = {};
  var Agave;
  var currentUser;
  var systems;
  var currentSystem;
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

  function init() {
    $('select[name="system"]', $appContext)
    .html(templates.systems({ systems: systems }))
    .on('change', function() {
      selectSystem(this.value);
    });

    $('button[name="directory-level-up"]', $appContext).on('click', function(e) {
      e.preventDefault();
      var path = currentPath.split('/').slice(0, -1).join('/');
      path = path || systemDefaultPath( currentSystem );
      openPath( path );
    });
  }

  function selectSystem(systemId) {
    $('.current-system-id').text(systemId || '#');
    if (systemId) {
      indicator({show: true});
      new Promise(function(resolve, reject) {
        Agave.api.systems.get({systemId: systemId}, function (resp) {
          resolve(resp.obj.result);
        }, function(err) {
          reject(err);
        });
      })
      .then(function(system) {
        currentSystem = system;
        return openPath( systemDefaultPath(currentSystem) );
      })
      .then(indicator);
    } else {
      currentSystem = currentPath = null;
      displayFiles();
    }
  }

  function systemDefaultPath(system) {
    var path;
    if ( system.id === 'araport-public-files' ) {
      path = '/TAIR10_genome_release';
    } else if ( system.public ) {
      path = '/' + currentUser.username;
    } else {
      path = system.storage.homeDir;
    }
    return path;
  }

  function displayFiles(files) {
    if (files) {
      if ( files[0].name === '.' ) {
        files.shift();
      }
      currentFiles = files;
      $('.display-files', $appContext).html( templates.files( { files: currentFiles, niceFileSize: niceFileSize } ) );
      $('button[name="open"]', $appContext).on( 'click', function(e) {
        e.preventDefault();
        var fileIndex = parseInt($(e.currentTarget).closest('tr').attr('data-file-index'));
        openPath( currentFiles[fileIndex].path );
      } );
    } else {
      currentFiles = null;
      $('.display-files', $appContext).empty();
      $('input[name="current-path"]', $appContext).val(null);
    }
  }

  function openPath(path) {
    currentPath = path;
    $('input[name="current-path"]', $appContext).val(path);
    indicator({show:true});
    return new Promise(function( res, rej ) {
      Agave.api.files.list({ systemId: currentSystem.id, filePath: currentPath }, function(resp) {
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
        systems = _.filter(resp.obj.result, { 'type': 'STORAGE' });
        res(systems);
      }, rej);
    })
    .then(init)
    .then(indicator);
  });

})(window, jQuery, _);
