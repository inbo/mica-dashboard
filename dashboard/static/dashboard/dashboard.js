// Helpers

// See: https://stackoverflow.com/questions/1129216/sort-array-of-objects-by-string-property-value
function dynamicSort(property) {
    var sortOrder = 1;
    if (property[0] === "-") {
        sortOrder = -1;
        property = property.substr(1);
    }
    return function (a, b) {
        /* next line works with strings and numbers,
         * and you may want to customize it to your needs
         */
        var result = (a[property] < b[property]) ? -1 : (a[property] > b[property]) ? 1 : 0;
        return result * sortOrder;
    }
}

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
                    <td>{{ occ.speciesId }}</td>
                    <td>{{ occ.datasetId }}</td>
                 </tr>
               </tbody>`
});

// The main table component (get all occurrence, manage table options, header and pagination)
Vue.component('dashboard-table', {
    props: {
        'occurrences': { // All occurrences, coming from the main component
            type: Array,
            default: function () {
                return []
            }
        }
    },
    data: function () {
        return {
            currentPage: 1,
            pageSize: 15,

            sortBy: 'id', // Entry for 'id' in the 'cols' objects

            cols: [
                // id: used internally by Vue code, label: displayed in header, dataAttribute: attribute of the occurrence object
                {'id': 'id', 'label': '#', 'dataAttribute': 'id'},
                {'id': 'lat', 'label': 'Lat', 'dataAttribute': 'lat'},
                {'id': 'lon', 'label': 'Lon', 'dataAttribute': 'lon'},
                {'id': 'speciesId', 'label': 'Species ID', 'dataAttribute': 'speciesId'},
                {'id': 'datasetId', 'label': 'Dataset ID', 'dataAttribute': 'datasetId'}
            ]
        }
    },
    computed: {
        sortByDataAttribute: function () {
            return this.cols.find(col => col.id === this.sortBy).dataAttribute;
        },
        sortedOccurrences: function () {
            return this.occurrences.sort(dynamicSort(this.sortByDataAttribute));
        },
        hasPreviousPage: function () {
            return (this.currentPage > 1);
        },
        hasNextPage: function () {
            return (this.currentPage < this.numberOfPages);
        },
        numberOfOccurrences: function () {
            return this.occurrences.length;
        },
        numberOfPages: function () {
            return Math.ceil(this.numberOfOccurrences / this.pageSize);
        },
        occurrencesCurrentPage: function () {
            let startIndex = (this.currentPage - 1) * this.pageSize;
            let endIndex = Math.min(startIndex + this.pageSize - 1, this.numberOfOccurrences - 1);

            return this.sortedOccurrences.slice(startIndex, endIndex + 1);
        }
    },
    template: `<div id="table-outer">
                    <table v-if="numberOfOccurrences > 0" class="table table-striped table-sm">
                        <thead class="thead-dark">
                            <tr>
                                <th :class="{ 'text-primary': (sortBy == col.id) } " v-for="col in cols" scope="col">
                                    <span @click="sortBy = col.id">{{ col.label }}</span>
                                </th>
                            </tr>
                        </thead>                 
                        <occurrence-table-page :occurrences="occurrencesCurrentPage"></occurrence-table-page>
                    </table>
                    <p v-if="numberOfOccurrences > 0" class="text-center"> 
                        <button type="button" :disabled="!hasPreviousPage" class="btn btn-outline-primary btn-sm" @click="currentPage -= 1">Previous</button>
                        Page {{ currentPage }} / {{ numberOfPages }}
                        <button type="button" :disabled="!hasNextPage" class="btn btn-outline-primary btn-sm" @click="currentPage += 1">Next</button>
                    </p>
               </div>`
});

// The main map
Vue.component('dashboard-map', {
    props: {
        'occurrences': Array,

        'initialLat': Number,
        'initialLon': Number,
        'initialZoom': Number,

        'heatmapBlur': {
            type: Number,
            default: 20
        },
        'heatmapRadius': {
            type: Number,
            default: 2
        },

        'visibleLayer': String // "pointsLayer" | "clusterLayer" | "heatmapLayer"
    },
    data: function () {
        return {
            clusterStyleCache: {},
            map: null,
            vectorSource: new ol.source.Vector(),
        }
    },
    watch: {
        visibleLayer: {
            handler: function (val) {
                this.setLayerVisibility(val);
            },
        },
        heatmapBlur: {
            handler: function (val) {
                this.heatmapLayer.setBlur(val);
            },
        },
        heatmapRadius: {
            handler: function (val) {
                this.heatmapLayer.setRadius(val);
            },
        },
        occurrences: {
            handler: function (val) {
                this.vectorSource.clear(true);

                var allFeatures = []
                val.forEach(function (occ) {
                    allFeatures.push(new ol.Feature({
                        geometry: new ol.geom.Point(ol.proj.fromLonLat([occ.lon, occ.lat]))
                    }))
                });
                this.vectorSource.addFeatures(allFeatures);

            },
            immediate: true
        },
    },
    computed: {
        allLayers: function () {
            return this.map.getLayers().getArray();
        },
        dataLayers: function () {
            return this.allLayers.filter(function (l) {
                return l.get('dataLayer') == true;
            })
        },
        pointsLayer: function () {
            return this.dataLayers.find(function (l) {
                return (l.get('name') == 'pointsLayer')
            });
        },
        clusterLayer: function () {
            return this.dataLayers.find(function (l) {
                return (l.get('name') == 'clusterLayer')
            });
        },
        heatmapLayer: function () {
            return this.dataLayers.find(function (l) {
                return (l.get('name') == 'heatmapLayer')
            });
        },
        vectorTilesLayer: function () {
            return this.dataLayers.find(function (l) {
                return (l.get('name') == 'vectorTilesLayer')
            });
        },
    },
    methods: {
        setLayerVisibility: function (layerName) {
            this.dataLayers.forEach(function (l) {
                if (l.get('name') === layerName) {
                    l.setVisible(true);
                } else {
                    l.setVisible(false);
                }
            })
        },
        createClusterLayer: function () {
            var vm = this;

            var clusterSource = new ol.source.Cluster({
                distance: 40,
                source: this.vectorSource,
            });

            var l = new ol.layer.Vector({
                source: clusterSource,
                visible: false,
                style: function (feature) {
                    var size = feature.get('features').length;
                    var style = vm.clusterStyleCache[size];
                    if (!style) {
                        style = new ol.style.Style({
                            image: new ol.style.Circle({
                                radius: 15,
                                stroke: new ol.style.Stroke({
                                    color: '#fff',
                                }),
                                fill: new ol.style.Fill({
                                    color: '#3399CC',
                                }),
                            }),
                            text: new ol.style.Text({
                                text: size.toString(),
                                fill: new ol.style.Fill({
                                    color: '#fff',
                                }),
                            }),
                        });
                        vm.clusterStyleCache[size] = style;
                    }
                    return style;
                },
            });
            l.set('name', 'clusterLayer')
            l.set('dataLayer', true);
            return l;
        },
        createHeatmapLayer: function () {
            var l = new ol.layer.Heatmap({
                source: this.vectorSource,
                visible: false,
                blur: this.heatmapBlur,
                radius: this.heatmapRadius,
            });
            l.set('name', 'heatmapLayer')
            l.set('dataLayer', true);
            return l;
        },
        createVectorTilesLayer: function() {
            var l = new ol.layer.VectorTile({
                source: new ol.source.VectorTile({
                    format: new ol.format.MVT(),
                    url: 'http://0.0.0.0:8000/api/tiles/{z}/{x}/{y}.mvt',
                    //projection: 'EPSG:4326',
                }),
                style: new ol.style.Style({
                    image: new ol.style.Circle({
                        fill: new ol.style.Fill({color: 'rgba(0, 128, 0, 1)'}),
                        stroke: new ol.style.Stroke({color: '#000000', width: 1.25}),
                        radius: 15
                    })
                })
            });

            l.set('name', 'vectorTilesLayer')
            l.set('dataLayer', true);
            return l;
        },
        createPointsLayer: function () {
            var l = new ol.layer.WebGLPoints({
                source: this.vectorSource,
                visible: false,
                style: {
                    symbol: {
                        symbolType: 'square',
                        size: 10,
                        color: 'rgba(255,0,0,0.1)'
                    }
                }
            })
            l.set('name', 'pointsLayer')
            l.set('dataLayer', true);
            return l;
        },
        createMap: function () {
            var baseLayer = new ol.layer.Tile({
                source: new ol.source.OSM({url: "http://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"})
            })

            return new ol.Map({
                layers: [
                    baseLayer,
                    this.createClusterLayer(),
                    this.createHeatmapLayer(),
                    this.createPointsLayer(),
                    this.createVectorTilesLayer()
                ],
                view: new ol.View({
                    center: ol.proj.fromLonLat([this.initialLon, this.initialLat]),
                    zoom: this.initialZoom
                })
            });
        }
    },
    mounted() {
        this.map = this.createMap();
        this.map.setTarget(this.$refs['map-root']); // Assign the map to div and display
        this.setLayerVisibility(this.visibleLayer);
        this.$emit('finished-mounting');
    },
    template: '<div id="map" class="map" ref="map-root" style="height: 500px; width: 100%;"></div>'
})