Vue.component('dashboard-occurrence-counter', {
    props: {
        'filters': Object,
        'counterUrl': String
    },
    data: function () {
        return {
            'count': 0
        }
    },
    methods: {
        updateCount: function (filters) {
            var vm = this;
            $.ajax({
                url: this.counterUrl,
                data: filters
            }).done(function (data) {
                vm.count = data.count;
            })
        }
    },
    watch: {
        'filters': {
            deep: true,
            immediate: true,
            handler: function (val) {
                this.updateCount(val);
            }
        }
    },

    template: `<h5>{{ count }} occurrence(s) matching selection</h5>`
});

// A single page in the occurrence table
Vue.component('occurrence-table-page', {
    props: {
        'occurrences': { // Only the subset for the page
            type: Array,
            default: function () {
                return []
            }
        }
    },
    template: `<tbody>
                 <tr v-for="occ in occurrences">
                    <th scope="row">{{ occ.id }}</th>
                    <td>{{ occ.lat }}</td>
                    <td>{{ occ.lon }}</td>
                    <td>{{ occ.date }}</td>
                    <td>{{ occ.speciesName }}</td>
                    <td>{{ occ.datasetName }}</td>
                 </tr>
               </tbody>`
});

// The main table component (receive all occurrence, manage table options, header and pagination)
// TODO: make it load data according to pagination
Vue.component('dashboard-table', {
    props: {
        'filters': Object,
        'occurrencesJsonUrl': String
    },
    watch: {
        filters: {
            deep: true,
            immediate: true,
            handler: function () {
                this.currentPage = 1;
                this.loadOccurrences(this.filters, this.sortBy, this.pageSize, this.currentPage);
            },
        },
        currentPage: function () {
            this.loadOccurrences(this.filters, this.sortBy, this.pageSize, this.currentPage);
        },
        sortBy: function () {
            this.loadOccurrences(this.filters, this.sortBy, this.pageSize, this.currentPage);
        },
    },
    methods: {
        changeSort: function (newSort) {
            if (newSort != null) {
                this.sortBy = newSort;
            }
        },
        loadOccurrences: function (filters, orderBy, pageSize, pageNumber) {
            var params = filters;
            params.order = orderBy;
            params.limit = pageSize;
            params.page_number = pageNumber;


            var vm = this;

            $.ajax({
                url: this.occurrencesJsonUrl,
                data: params,
            }).done(function (data) {
                vm.occurrences = data.results;
                vm.firstPage = data.firstPage;
                vm.lastPage = data.lastPage - 1;
                vm.totalOccurrencesCount = data.totalResultsCount;
            })
        }
    },
    data: function () {
        return {
            currentPage: 1,
            firstPage: null,
            lastPage: null,
            pageSize: 10,
            totalOccurrencesCount: null,
            sortBy: 'id',
            occurrences: [],

            cols: [
                // sortId: must match django QS filter (null = non-sortable), label: displayed in header
                {'sortId': 'id', 'label': '#',},
                {'sortId': null, 'label': 'Lat',},
                {'sortId': null, 'label': 'Lon',},
                {'sortId': null, 'label': 'Date',},
                {'sortId': 'species__name', 'label': 'Species',},
                {'sortId': 'source_dataset__name', 'label': 'Dataset',}
            ]
        }
    },
    computed: {
        hasPreviousPage: function () {
            return (this.currentPage > 1);
        },
        hasNextPage: function () {
            return (this.currentPage < this.lastPage);
        },
    },
    template: `<div id="table-outer">
                    <table class="table table-striped table-sm">
                        <thead class="thead-dark">
                            <tr>
                                <th :class="{ 'text-primary': (sortBy == col.sortId) }" v-for="col in cols" scope="col">
                                    <span @click="changeSort(col.sortId)">{{ col.label }}</span>
                                </th>
                            </tr>
                        </thead>                 
                        <occurrence-table-page :occurrences="occurrences"></occurrence-table-page>
                    </table>
                    <p class="text-center"> 
                        <button type="button" :disabled="!hasPreviousPage" class="btn btn-outline-primary btn-sm" @click="currentPage -= 1">Previous</button>
                        Page {{ currentPage }} / {{ lastPage }}
                        <button type="button" :disabled="!hasNextPage" class="btn btn-outline-primary btn-sm" @click="currentPage += 1">Next</button>
                    </p>
               </div>`
});

// The main map
Vue.component('dashboard-map', {
    props: {
        'minMaxUrl': String,
        'tileServerUrlTemplate': String,

        'initialLat': Number,
        'initialLon': Number,
        'initialZoom': Number,

        'visibleLayer': String,

        'filters': Object, // For filtering occurrence data
        'showCounters': Boolean,

        'dataLayerOpacity': Number,
    },
    data: function () {
        return {
            map: null,
            vectorSource: new ol.source.Vector(),
            HexMinOccCount: 1,
            HexMaxOccCount: 1
        }
    },
    watch: {
        dataLayerOpacity: {
            handler: function (val) {
                if (this.vectorTilesLayer) {
                    this.vectorTilesLayer.setOpacity(val);
                }
            }
        },
        HexMinOccCount: {
            handler: function (val) {
                this.replaceVectorTilesLayer();
            },
        },
        HexMaxOccCount: {
            handler: function (val) {
                this.replaceVectorTilesLayer();
            },
        },
        visibleLayer: {
            handler: function (val) {
                this.setLayerVisibility(val);
            },
        },
        showCounters: {
            handler: function () {
                if (this.vectorTilesLayer) {
                    this.vectorTilesLayer.setStyle(this.vectorTilesLayerStyleFunction)
                }
            },
        },
        filters: {
            deep: true,
            handler: function (val) {
                this.loadOccMinMax(this.initialZoom, this.filters);
            },
        }

    },
    computed: {
        colorScale: function () {
            return d3.scaleSequentialLog(d3.interpolateBlues)
                .domain([this.HexMinOccCount, this.HexMaxOccCount])
        },
        allLayers: function () {
            return this.map.getLayers().getArray();
        },
        dataLayers: function () {
            return this.allLayers.filter(function (l) {
                return l.get('dataLayer') == true;
            })
        },
        vectorTilesLayer: function () {
            return this.dataLayers.find(function (l) {
                return (l.get('name') == 'vectorTilesLayer')
            });
        },
        vectorTilesLayerStyleFunction: function () {
            var vm = this;
            return function (feature) {
                var fillColor = vm.colorScale(feature.properties_.count);
                var textValue = vm.showCounters ? '' + feature.properties_.count : ''

                return new ol.style.Style({
                    stroke: new ol.style.Stroke({
                        color: 'grey',
                        width: 1,
                    }),
                    fill: new ol.style.Fill({
                        color: fillColor
                    }),
                    text: new ol.style.Text({
                        text: textValue,
                        fill: new ol.style.Fill({color: vm.legibleColor(fillColor)})
                    })
                })
            }
        }
    },
    methods: {
        replaceVectorTilesLayer: function () {
            if (this.vectorTilesLayer) {
                this.removeVectorTilesLayer();
            }
            this.map.addLayer(this.createVectorTilesLayer());
        },
        setLayerVisibility: function (layerName) {
            this.dataLayers.forEach(function (l) {
                if (l.get('name') === layerName) {
                    l.setVisible(true);
                } else {
                    l.setVisible(false);
                }
            })
        },
        removeVectorTilesLayer: function () {
            this.map.removeLayer(this.vectorTilesLayer);
        },
        legibleColor: function (color) {
            return d3.hsl(color).l > 0.5 ? "#000" : "#fff"
        },
        createVectorTilesLayer: function () {
            var vm = this;
            var l = new ol.layer.VectorTile({
                source: new ol.source.VectorTile({
                    format: new ol.format.MVT(),
                    url: vm.tileServerUrlTemplate + '?' + $.param(vm.filters),
                }),
                opacity: vm.dataLayerOpacity,
                style: vm.vectorTilesLayerStyleFunction
            });

            l.set('name', 'vectorTilesLayer')
            l.set('dataLayer', true);
            return l;
        },
        loadOccMinMax: function (zoomLevel, filters) {
            var vm = this

            var params = filters;
            params.zoom = zoomLevel;

            $.ajax({
                url: this.minMaxUrl,
                data: params
            }).done(function (data) {
                vm.HexMinOccCount = data.min;
                vm.HexMaxOccCount = data.max;
            })

        },
        createBaseMap: function () {
            var baseLayer = new ol.layer.Tile({
                source: new ol.source.OSM({url: "http://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"})
            })

            return new ol.Map({
                layers: [
                    baseLayer
                ],
                view: new ol.View({
                    center: ol.proj.fromLonLat([this.initialLon, this.initialLat]),
                    zoom: this.initialZoom
                })
            });
        }
    },
    mounted() {
        this.loadOccMinMax(this.initialZoom, this.filters);
        this.map = this.createBaseMap();
        this.map.setTarget(this.$refs['map-root']); // Assign the map to div and display
        this.setLayerVisibility(this.visibleLayer);
    },
    template: '<div id="map" class="map" ref="map-root" style="height: 500px; width: 100%;"></div>'
})