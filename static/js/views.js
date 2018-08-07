const DownloadConfig = {
    template: `
        <div class="column has-padding">
            <h4 class="subtitle">Downloading config...</h4>

            <br />
            <progress class="progress is-info is-medium" value="0" max="100">
                0%
            </progress>
        </div>
    `,
    created: function() {
        this.download_install_status();
    },
    methods: {
        download_install_status: function() {
            var that = this; // IE workaround

            ajax("/api/installation-status", function(e) {
                app.metadata = e;

                that.download_config();
            });
        },
        download_config: function() {
            var that = this; // IE workaround

            ajax("/api/config", function(e) {
                app.config = e;

                that.choose_next_state();

            }, function(e) {
                console.error("Got error while downloading config: "
                    + e);

                if (app.is_launcher) {
                    // Just launch the target application
                    app.exit();
                } else {
                    router.replace({name: 'showerr', params: {msg: "Got error while downloading config: "
                                + e}});
                }
            });
        },
        choose_next_state: function() {
            if (app.metadata.preexisting_install) {
                app.install_location = app.metadata.install_path;

                // Copy over installed packages
                for (var x = 0; x < app.config.packages.length; x++) {
                    app.config.packages[x].default = false;
                    app.config.packages[x].installed = false;
                }

                for (var i = 0; i < app.metadata.database.length; i++) {
                    // Find this config package
                    for (var x = 0; x < app.config.packages.length; x++) {
                        if (app.config.packages[x].name === app.metadata.database[i].name) {
                            app.config.packages[x].default = true;
                            app.config.packages[x].installed = true;
                        }
                    }
                }

                if (app.metadata.is_launcher) {
                    router.replace("/install/regular");
                } else {
                    router.replace("/modify");
                }
            } else {
                for (var x = 0; x < app.config.packages.length; x++) {
                    app.config.packages[x].installed = false;
                }

                // Need to do a bit more digging to get at the
                // install location.
                ajax("/api/default-path", function(e) {
                    if (e.path != null) {
                        app.install_location = e.path;
                    }
                });

                router.replace("/packages");
            }
        }
    }
};

const SelectPackages = {
    template: `
        <div class="column has-padding">
            <h4 class="subtitle">Select your preferred settings:</h4>

            <!-- Build options -->
            <div class="tile is-ancestor">
                <div class="tile is-parent" v-for="package in $root.$data.config.packages" :index="package.name">
                    <div class="tile is-child">
                        <div class="box">
                            <label class="checkbox">
                                <input type="checkbox" v-model="package.default" />
                                {{ package.name }}
                                <span v-if="package.installed"><i>(installed)</i></span>
                            </label>
                            <p>
                                {{ package.description }}
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            <div class="subtitle is-6" v-if="!$root.$data.metadata.preexisting_install">Install Location</div>
            <div class="field has-addons" v-if="!$root.$data.metadata.preexisting_install">
                <div class="control is-expanded">
                    <input class="input" type="text" v-model="$root.$data.install_location"
                           placeholder="Enter a install path here">
                </div>
                <div class="control">
                    <a class="button is-dark" v-on:click="select_file">
                        Select
                    </a>
                </div>
            </div>

            <a class="button is-dark is-pulled-right" v-if="!$root.$data.metadata.preexisting_install" 
               v-on:click="install">Install!</a>
            <a class="button is-dark is-pulled-right" v-if="$root.$data.metadata.preexisting_install"
               v-on:click="install">Modify</a>
            <a class="button is-pulled-left" v-if="$root.$data.metadata.preexisting_install"
               v-on:click="go_back">Back</a>
        </div>
    `,
    methods: {
        select_file: function() {
            window.external.invoke(JSON.stringify({
                SelectInstallDir: {
                    callback_name: "selectFileCallback"
                }
            }));
        },
        install: function() {
            router.push("/install/regular");
        },
        go_back: function() {
            router.go(-1);
        }
    }
};

const InstallPackages = {
    template: `
        <div class="column has-padding">
            <h4 class="subtitle" v-if="$root.$data.metadata.is_launcher">Checking for updates...</h4>
            <h4 class="subtitle" v-else-if="is_uninstall">Uninstalling...</h4>
            <h4 class="subtitle" v-else>Installing...</h4>
            <div v-html="$root.$data.config.installing_message"></div>
            <br />

            <div v-html="progress_message"></div>
            <progress class="progress is-info is-medium" v-bind:value="progress" max="100">
                {{ progress }}%
            </progress>
        </div>
    `,
    data: function() {
        return {
            progress: 0.0,
            progress_message: "Please wait...",
            is_uninstall: false,
            failed_with_error: false
        }
    },
    created: function() {
        this.is_uninstall = this.$route.params.kind === "uninstall";
        this.install();
    },
    methods: {
        install: function() {
            var results = {};

            for (var package_index = 0; package_index < app.config.packages.length; package_index++) {
                var current_package = app.config.packages[package_index];
                if (current_package.default != null) {
                    results[current_package.name] = current_package.default;
                }
            }

            results["path"] = app.install_location;

            var that = this; // IE workaround

            stream_ajax(this.is_uninstall ? "/api/uninstall" :
                "/api/start-install", function(line) {
                if (line.hasOwnProperty("Status")) {
                    that.progress_message = line.Status[0];
                    that.progress = line.Status[1] * 100;
                }

                if (line.hasOwnProperty("Error")) {
                    if (app.metadata.is_launcher) {
                        app.exit();
                    } else {
                        that.failed_with_error = true;
                        router.replace({name: 'showerr', params: {msg: line.Error}});
                    }
                }
            }, function(e) {
                if (app.metadata.is_launcher) {
                    app.exit();
                } else if (!that.failed_with_error) {
                    router.push("/complete");
                }
            }, undefined, results);
        }
    }
};

const ErrorView = {
    template: `
        <div class="column has-padding">
            <h4 class="subtitle">An error occurred:</h4>

            <code>{{ msg }}</code>

            <a class="button is-primary is-pulled-right" v-if="remaining" v-on:click="go_back">Back</a>
        </div>
    `,
    data: function() {
        return {
            msg: this.$route.params.msg,
            remaining: window.history.length > 1
        }
    },
    methods: {
        go_back: function() {
            router.go(-1);
        }
    }
};

const CompleteView = {
    template: `
        <div class="column has-padding">
            <h4 class="subtitle">Thanks for installing {{ $root.$data.attrs.name }}!</h4>

            <a class="button is-dark is-pulled-right" v-on:click="exit">Exit</a>
        </div>
    `,
    methods: {
        exit: function() {
            app.exit();
        }
    }
};

const ModifyView = {
    template: `
        <div class="column has-padding">
            <h4 class="subtitle">Choose an option:</h4>

            <div class="field is-grouped">
                <p class="control">
                    <a class="button is-link" v-on:click="update">
                        Update
                    </a>
                </p>
                <p class="control">
                    <a class="button" v-on:click="modify_packages">
                        Modify
                    </a>
                </p>
                <p class="control">
                    <a class="button is-danger" v-on:click="prepare_uninstall">
                        Uninstall
                    </a>
                </p>
            </div>
            
            <div class="modal is-active" v-if="show_uninstall">
                <div class="modal-background"></div>
                <div class="modal-card">
                    <header class="modal-card-head">
                        <p class="modal-card-title">Are you sure you want to uninstall {{ $root.$data.attrs.name }}?</p>
                    </header>
                    <footer class="modal-card-foot">
                        <button class="button is-danger" v-on:click="uninstall">Yes</button>
                        <button class="button" v-on:click="cancel_uninstall">No</button>
                    </footer>
                </div>
            </div>
        </div>
    `,
    data: function() {
        return {
            show_uninstall: false
        }
    },
    methods: {
        update: function() {
            router.push("/install/regular");
        },
        modify_packages: function() {
            router.push("/packages");
        },
        prepare_uninstall: function() {
            this.show_uninstall = true;
        },
        cancel_uninstall: function() {
            this.show_uninstall = false;
        },
        uninstall: function() {
            router.push("/install/uninstall");
        },
    }
};

const router = new VueRouter({
    routes: [
        {
            path: '/config',
            name: 'config',
            component: DownloadConfig
        },
        {
            path: '/packages',
            name: 'packages',
            component: SelectPackages
        },
        {
            path: '/install/:kind',
            name: 'install',
            component: InstallPackages
        },
        {
            path: '/showerr',
            name: 'showerr',
            component: ErrorView
        },
        {
            path: '/complete',
            name: 'complete',
            component: CompleteView
        },
        {
            path: '/modify',
            name: 'modify',
            component: ModifyView
        },
        {
            path: '/',
            redirect: '/config'
        }
    ]
});