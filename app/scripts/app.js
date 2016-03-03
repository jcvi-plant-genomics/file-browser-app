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

  templates.systems = _.template(
    '<option value="">Choose a system to browse</option>' +
    '<optgroup label="Private Systems"><% _.each(privateSystems, function(system) { %><option value="<%= system.id %>">(<%= system.id %>) <%= system.name %></option><% }); %></optgroup>' +
    '<optgroup label="Public Systems"><% _.each(publicSystems, function(system) { %><option value="<%= system.id %>">(<%= system.id %>) <%= system.name %></option><% }); %></optgroup>'
    );
  templates.files = _.template(
    '<% _.each(files, function(file, i) { %><tr data-file-index="<%= i %>"><td><%= file.name %></td>'+
    '<td><i class="fa fa-<%= file.type === \'dir\' ? \'folder\' : \'file\' %>"></i> <%= file.mimeType %></td>' +
    '<td><% if (file.type === \'file\') { %><%= niceFileSize(file.length) %><% } %></td>' +
    '<td><%= fileActions({file: file}) %></td></tr><% }); %>'
    );
  templates.fileActions = _.template(
    '<% if (file.type === \'file\') { %>' +
      '<% if (file.permissions === \'READ\' || file.permissions === \'READ_WRITE\' || file.permissions === \'ALL\' ) { %>' +
        '<button title="Preview" name="preview" class="btn btn-xs btn-info"><i class="fa fa-eye"></i><span class="sr-only">Preview</span></button> ' +
        '<button title="Download" name="download" class="btn btn-xs btn-primary"><i class="fa fa-cloud-download"></i><span class="sr-only">Download</span></button> ' +
      '<% } if (file.permissions === \'READ_WRITE\' || file.permissions === \'ALL\') { %>' +
        '<button title="Delete" name="delete" class="btn btn-xs btn-danger"><i class="fa fa-times"></i><span class="sr-only">Delete</span></button> ' +
      '<% } %>' +
    '<% } else if (file.type === \'dir\'){%>' +
    '<button title="Open" name="open" class="btn btn-xs btn-default"><i class="fa fa-folder-open"></i><span class="sr-only">Open</span></button> ' +
    '<% } %>'
    );


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

  function showAlert(opts) {
    var $msg = $('<div class="alert alert-' + (opts.type || 'info') + ' alert-dismissible">');
    $msg.append('<button type="button" class="close" data-dismiss="alert" aria-label="Close"><span aria-hidden="true">&times;</span></button>');
    $msg.append(opts.message);
    $('.alerts', $appContext).append($msg);
    if (opts.autoDismiss) {
      setTimeout(function() {
        $msg.remove();
      }, opts.autoDismiss);
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
    .html(templates.systems({
      privateSystems: _.filter(systems, { public: false }),
      publicSystems: _.filter(systems, { public: true })
    }))
    .on('change', function() {
      selectSystem(this.value);
    });

    $('a[name="directory-level-up"]', $appContext).on('click', function(e) {
      e.preventDefault();
      var path = currentPath.split('/').slice(0, -1).join('/');
      path = path || systemDefaultPath( currentSystem );
      openPath( path );
    });

    $('form[name="system-path"]', $appContext).on('submit', function(e) {
      console.log(e);
      e.preventDefault();
      var path = $('input[name="current-path"]', $appContext).val();
      path = path || systemDefaultPath( currentSystem );
      openPath( path ).then(false, function(err) {
        $('input[name="current-path"]', $appContext).val(currentPath);
        showAlert({message: err.obj.message + ': ' + path, type: 'danger', autoDismiss: 3000});
      });
    });
  }

  function selectSystem(systemId) {
    $('.current-system-id').text(systemId || '#');
    if (systemId) {
      indicator({show: true});
      new Promise(function(resolve, reject) {
        Agave.api.systems.get({systemId: systemId}, function (resp) { resolve(resp.obj.result); }, reject);
      })
      .then(function(system) {
        currentSystem = system;
        return openPath( systemDefaultPath(currentSystem) );
      })
      .then(indicator, indicator);
    } else {
      currentSystem = currentPath = null;
      displayFiles();
    }
  }

  function systemDefaultPath(system) {
    var path;
    if ( system.id === 'cyverse-legfed-datastore' ) {
      path = '/';
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
      $('.display-files', $appContext).html( templates.files( { files: currentFiles, niceFileSize: niceFileSize, fileActions: templates.fileActions } ) );

      $('button[name="open"]', $appContext).on( 'click', function(e) {
        e.preventDefault();
        var fileIndex = parseInt($(e.currentTarget).closest('tr').attr('data-file-index'));
        openPath( currentFiles[fileIndex].path );
      });

      $('button[name="preview"]', $appContext).on( 'click', function(e) {
        e.preventDefault();
        var fileIndex = parseInt($(e.currentTarget).closest('tr').attr('data-file-index'));
        previewFile( currentFiles[fileIndex] );
      });

      $('button[name="download"]', $appContext).on( 'click', function(e) {
        e.preventDefault();
        var $button = $(this);
        var content = $button.html();
        $button.attr('disabled', true).html('<i class="fa fa-spinner fa-spin"></i>');
        var fileIndex = parseInt($(e.currentTarget).closest('tr').attr('data-file-index'));
        downloadFile( currentFiles[fileIndex] ).then(function() {
          $button.attr('disabled', null).html(content);
        }, function() {
          $button.attr('disabled', null).html(content);
        });
      });

      $('button[name="delete"]', $appContext).on( 'click', function(e) {
        e.preventDefault();
        var $button = $(this);
        if (window.confirm('Are you sure you want to delete this file? This operation cannot be undone.')) {
          var fileIndex = parseInt($(e.currentTarget).closest('tr').attr('data-file-index'));
          deleteFile( currentFiles[fileIndex] ).then(function(file) {
            $button.closest('tr').remove();
            showAlert({
              message: 'The file ' + file.name + ' has been deleted.',
              type: 'success',
              autoDismiss: 5000
            });
          },
          function(error) {
            showAlert({
              message: error.message,
              type: 'danger',
              autoDismiss: 5000
            });
          });
        }
      });

    } else {
      currentFiles = null;
      $('.display-files', $appContext).empty();
      $('input[name="current-path"]', $appContext).val(null);
    }
  }

  function openPath(path) {
    $('input[name="current-path"]', $appContext).val(path);
    indicator({show:true});
    var p = new Promise(function( res, rej ) {
      Agave.api.files.list(
        { systemId: currentSystem.id, filePath: path },
        function(resp) {
          currentPath = path;
          res(resp.obj.result);
        },
        rej
      );
    });
    p.then(displayFiles).then(indicator, indicator);
    return p;
  }

  function deleteFile(file) {
    var promise = new Promise(function(resolve, reject) {
      Agave.api.files.delete({systemId: file.system, filePath: file.path},
        function() { resolve(file); },
        reject
      );
    });

    promise.then(false, function(err) {
      showAlert({ message: err.message, type: 'danger', autoDismiss: 5000 });
    });

    return promise;
  }

  function downloadFile(file) {
    var promise = new Promise(function(resolve, reject) {
      var req = Agave.api.files.download({systemId: file.system, filePath: file.path}, {mock: true});
      var xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function() {
        if (this.readyState === 4) {
          if (this.status === 200) {
            resolve(this.response);
          } else {
            var reader = new FileReader();
            reader.onload = function() {
              reject(JSON.parse(reader.result));
            };
            reader.readAsText(this.response);
          }
        }
      };
      xhr.open(req.method, req.url);
      xhr.setRequestHeader('Authorization', 'Bearer ' + Agave.token.accessToken);
      xhr.responseType = 'blob';
      xhr.send();
    });

    promise.then(
      function(fileData) {
        window.saveAs(fileData, file.name);
      },
      function(err) {
        showAlert({ message: err.message, type: 'danger', autoDismiss: 5000 });
      }
    );

    return promise;
  }

  function previewFile(file) {
    var $preview = $('<div class="file-browser-app-preview loading"><div class="file-browser-app-preview-overlay"></div><div class="file-browser-app-preview-header container"><header><button type="button" data-dismiss="preview" class="btn btn-danger btn-sm pull-right">&times;</button><h4 class="file-browser-app-preview-title"></h4></header></div><div class="container file-browser-app-preview-item-wrapper"><div class="file-browser-app-preview-item"></div></div></div>');
    $('body').append($preview);

    $('.file-browser-app-preview-title', $preview).text(file.name);

    new Promise(function(resolve, reject) {
      var req = Agave.api.files.download({systemId: file.system, filePath: file.path}, {mock: true});
      var xhr = new XMLHttpRequest();
      xhr.onreadystatechange = function() {
        if (this.readyState === 4) {
          if (this.status === 200) {
            var blobUrl;
            if (file.mimeType === 'application/pdf') {
              // object
              blobUrl = URL.createObjectURL( this.response );
              $('<object>')
                .attr('data', blobUrl)
                .attr('class', 'embed-responsive-item')
                .on('load', function() {
                  URL.revokeObjectURL(blobUrl);
                })
                .appendTo('.file-browser-app-preview-item', $preview);
              $('.file-browser-app-preview-item', $preview).addClass('embed-responsive embed-responsive-4by3');
            } else if (file.mimeType.indexOf('image') === 0) {
              // img
              blobUrl = URL.createObjectURL( this.response );
              $('<img>')
                .attr('class', 'img-responsive')
                .attr('src', blobUrl)
                .on('load', function() {
                  URL.revokeObjectURL(blobUrl);
                })
                .appendTo('.file-browser-app-preview-item', $preview);
            } else {
              // text
              $('<pre>').appendTo('.file-browser-app-preview-item', $preview).text(this.response);
            }
            resolve(true);
          } else {
            if (this.responseType === 'blob') {
              var reader = new FileReader();
              reader.onload = function() {
                reject(JSON.parse(reader.result));
              };
              reader.readAsText(this.response);
            } else {
              reject(JSON.parse(this.response));
            }
          }
        }
      };
      xhr.open(req.method, req.url);
      xhr.setRequestHeader('Authorization', 'Bearer ' + Agave.token.accessToken);
      if (file.mimeType === 'application/pdf' || file.mimeType.indexOf('image') === 0) {
        xhr.responseType = 'blob';
      } else {
        xhr.responseType = 'text';
      }
      xhr.send();
    }).then(function() {
      $preview.removeClass('loading');
      $('.file-browser-app-preview-overlay, [data-dismiss="preview"]', $preview).on('click', function() { $preview.remove(); });
    }, function(err) {
      $preview.remove();
      showAlert({ message: err.message, type: 'danger', autoDismiss: 5000 });
    });
  }

  /* Generate Agave API docs */
  window.addEventListener('Agave::ready', function() {
    Agave = window.Agave;

    indicator({show: true});

    Agave.api.profiles.me({}, function(resp) {
      currentUser = resp.obj.result;
    });

    new Promise( function( res, rej ) {
      Agave.api.systems.list({},
        function(resp) {
          systems = _.chain(resp.obj.result)
            .filter({ 'type': 'STORAGE' }) // only show storage systems
            .reject({ 'id': 'araport-compute-00-storage' }) // hide this one; not browsable
            .value();
          res(systems);
        },
        rej
      );
    })
    .then(init)
    .then(function() {
      var defaultSystems = _.filter(systems, { 'default': true });
      if (defaultSystems.length) {
        $('select[name="system"]', $appContext).val(defaultSystems[0].id);
        selectSystem(defaultSystems[0].id);
      }
    });
  });

})(window, jQuery, _);
