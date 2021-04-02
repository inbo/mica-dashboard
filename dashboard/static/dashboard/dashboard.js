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
            handler: function(val) {
                this.updateCount(val);
            }
        }
    },

    template: `<h3>{{ count }} occurrence(s) matching selection</h3>`
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
                    <td>{{ occ.speciesId }}</td>
                    <td>{{ occ.datasetId }}</td>
                 </tr>
               </tbody>`
});

// The main table component (receive all occurrence, manage table options, header and pagination)
// TODO: make it load data according to pagination
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
        'minMaxUrl': String,

        'initialLat': Number,
        'initialLon': Number,
        'initialZoom': Number,

        'visibleLayer': String,

        'filters': Object // For filtering occurrence data
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
        filters: {
            deep: true,
            handler: function (val) {
                this.replaceVectorTilesLayer();
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
    },
    methods: {
        replaceVectorTilesLayer: function() {
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
        removeVectorTilesLayer: function() {
            this.map.removeLayer(this.vectorTilesLayer);
        },
        createVectorTilesLayer: function () {
            var vm = this;
            var l = new ol.layer.VectorTile({
                source: new ol.source.VectorTile({
                    format: new ol.format.MVT(),
                    url: 'http://0.0.0.0:8000/api/tiles/{z}/{x}/{y}.mvt' + '?' + $.param(vm.filters),
                    //projection: 'EPSG:4326',
                }),
                style: function (feature) {
                    //console.log("Feature:", feature)
                    //var opacity = feature.properties_.count / 50;
                    return new ol.style.Style({
                        stroke: new ol.style.Stroke({
                            color: 'white',
                            width: 1,
                        }),
                        fill: new ol.style.Fill({
                            color: vm.colorScale(feature.properties_.count)
                        }),
                    })
                }
            });

            l.set('name', 'vectorTilesLayer')
            l.set('dataLayer', true);
            return l;
        },
        loadOccMinMax: function (zoomLevel) {
            var vm = this;
            $.ajax({
                url: this.minMaxUrl,
                data: {zoom: zoomLevel}
            }).done(function (data) {
                //console.log(data)
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
        this.loadOccMinMax(this.initialZoom);
        this.map = this.createBaseMap();
        this.map.setTarget(this.$refs['map-root']); // Assign the map to div and display
        this.setLayerVisibility(this.visibleLayer);
    },
    template: '<div id="map" class="map" ref="map-root" style="height: 500px; width: 100%;"></div>'
})