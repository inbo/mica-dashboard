function truncateString(str, num) {
  if (str.length > num) {
    return str.slice(0, num) + "...";
  } else {
    return str;
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
    computed: {
        preparedOccurrences: function () {
            // The occurrences, but formatted for display
            return this.occurrences.map(o => ({...o, ...{
                shortDatasetName: truncateString(o.datasetName, 20),
                shortSpeciesName: o.speciesName.replace(/\([^\)\(]*\)/, ""), // Remove authorship (between parentheses)
                recordType: o.isCatch ? "catch" : "observation",
                occurrenceGbifUrl: "https://www.gbif.org/occurrence/" + o.gbifId,
                datasetGbifUrl: "https://www.gbif.org/dataset/" + o.datasetKey,
            }}))
        }
    },
    template: `<tbody>
                 <tr v-for="occ in preparedOccurrences">
                    <th scope="row">
                        <a :href="occ.occurrenceGbifUrl" target="_blank">{{ occ.gbifId }}</a>
                    </th>
                    <td>{{ occ.lat }}</td>
                    <td>{{ occ.lon }}</td>
                    <td>{{ occ.date }}</td>
                    <td><i>{{ occ.shortSpeciesName }}</i></td>
                    <td>
                        <a :href="occ.datasetGbifUrl" target="_blank">{{ occ.shortDatasetName }}</a> 
                    </td>
                    <td>{{ occ.recordType }}</td>
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
            pageSize: 20,
            totalOccurrencesCount: null,
            sortBy: 'id',
            occurrences: [],

            cols: [
                // sortId: must match django QS filter (null = non-sortable), label: displayed in header
                {'sortId': 'gbif_id', 'label': 'GBIF id',},
                {'sortId': null, 'label': 'Lat',},
                {'sortId': null, 'label': 'Lon',},
                {'sortId': '-date', 'label': 'Date',},
                {'sortId': 'species__name', 'label': 'Species',},
                {'sortId': 'source_dataset__name', 'label': 'Dataset',},
                {'sortId': null, 'label': 'Type',}
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
        isOnLastPage: function () {
            return (this.currentPage === this.lastPage);
        },
        isOnFirstPage: function () {
            return (this.currentPage === this.firstPage);
        }
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
                        <button type="button" :disabled="isOnFirstPage" class="btn btn-outline-primary btn-sm" @click="currentPage = firstPage">First</button> 
                        <button type="button" :disabled="!hasPreviousPage" class="btn btn-outline-primary btn-sm" @click="currentPage -= 1">Previous</button>
                        Page {{ currentPage }} / {{ lastPage }}
                        <button type="button" :disabled="!hasNextPage" class="btn btn-outline-primary btn-sm" @click="currentPage += 1">Next</button>
                        <button type="button" :disabled="isOnLastPage" class="btn btn-outline-primary btn-sm" @click="currentPage = lastPage">Last</button>
                    </p>
               </div>`
});

// The main map
Vue.component('dashboard-map', {
    props: {
        'minMaxUrl': String,
        'tileServerUrlTemplateOccurrences': String,
        'tileServerUrlTemplateOccurrencesForWater': String,
        'mapDataType': String, // occurrences | occurrencesForWater. Will impact the tile server url to use + display style

        'initialLat': Number,
        'initialLon': Number,
        'initialZoom': Number,

        'filters': Object, // For filtering occurrence data
        'showCounters': Boolean,

        'dataLayerOpacity': Number,

        'overlayServerUrl': String,
        'overlayId': null
    },
    data: function () {
        return {
            map: null,
            vectorSource: new ol.source.Vector(),
            areasOverlayCollection: new ol.Collection(),
            HexMinOccCount: 1,
            HexMaxOccCount: 1,

            occurrencesVectorTilesLayer: null,
            occurrencesForWaterVectorTilesLayer: null,
        }
    },
    watch: {
        mapDataType: {
            handler: function (newVal) {
                this.setTilesLayerVisbilility(newVal);
            }
        },
        overlayId: {
            immediate: true,
            handler: function (overlayId) {
                this.refreshAreas();
            }
        },
        dataLayerOpacity: {
            handler: function (val) {
                if (this.occurrencesVectorTilesLayer) {
                    this.occurrencesVectorTilesLayer.setOpacity(val);
                }
                if (this.occurrencesForWaterVectorTilesLayer) {
                    this.occurrencesForWaterVectorTilesLayer.setOpacity(val);
                }
            }
        },
        HexMinOccCount: {
            handler: function (val) {
                this.restyleOccurrencesVectorTilesLayer();
            },
        },
        HexMaxOccCount: {
            handler: function (val) {
                this.restyleOccurrencesVectorTilesLayer();
            },
        },
        showCounters: {
            handler: function () {
                this.restyleOccurrencesVectorTilesLayer();
            },
        },
        filters: {
            deep: true,
            handler: function (val) {
                this.loadOccMinMax(this.initialZoom, this.filters);
                this.replaceVectorTilesLayers()
            },
        }

    },
    computed: {
        colorScaleOccurrences: function () {
            return d3.scaleSequentialLog(d3.interpolateBlues)
                .domain([this.HexMinOccCount, this.HexMaxOccCount])
        },
        colorScaleOccurrencesForWater: function () {
            return d3.scaleSequentialLog(d3.interpolateReds)
        },

        occurrencesForWaterTilesLayerStyleFunction: function () {
            var vm = this;
            return function (feature) {

                let r = feature.properties_.rats_count;
                let w = feature.properties_.waterway_length_in_meters;

                //let fillColor = vm.colorScaleOccurrencesForWater(feature.properties_.water_score);
                let textValue = "r: " + r + "\n" + "w: " + w;
                // TODO: also retrieve the rat_score and compute a ratio
                //console.log(feature.properties_)

                return new ol.style.Style({
                    stroke: new ol.style.Stroke({
                        color: 'black',
                        width: 1,
                    }),
                    fill: new ol.style.Fill({
                        color: 'lightgrey',
                    }),
                    text: new ol.style.Text({
                        text: textValue,
                        //fill: 'black',
                    })
                })
            }

        },
        occurrencesVectorTilesLayerStyleFunction: function () {
            var vm = this;
            return function (feature) {
                var fillColor = vm.colorScaleOccurrences(feature.properties_.count);
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
        setTilesLayerVisbilility: function (selectedDataType) {
            if (selectedDataType === 'occurrences') {
                this.occurrencesVectorTilesLayer.setVisible(true);
                this.occurrencesForWaterVectorTilesLayer.setVisible(false);
            } else if (selectedDataType === 'occurrencesForWater') {
                this.occurrencesForWaterVectorTilesLayer.setVisible(true);
                this.occurrencesVectorTilesLayer.setVisible(false);
            }
        },
        restyleOccurrencesVectorTilesLayer: function () {
            if (this.occurrencesVectorTilesLayer) {
                this.occurrencesVectorTilesLayer.setStyle(this.occurrencesVectorTilesLayerStyleFunction)
            }
        },
        replaceVectorTilesLayers: function () {
            this.map.removeLayer(this.occurrencesVectorTilesLayer);
            this.map.removeLayer(this.occurrencesForWaterVectorTilesLayer);

            this.loadOccMinMax(this.initialZoom, this.filters);
            this.occurrencesVectorTilesLayer = this.createVectorTilesLayer(this.tileServerUrlTemplateOccurrences, this.occurrencesVectorTilesLayerStyleFunction, 2);
            this.map.addLayer(this.occurrencesVectorTilesLayer);
            this.occurrencesForWaterVectorTilesLayer = this.createVectorTilesLayer(this.tileServerUrlTemplateOccurrencesForWater, this.occurrencesForWaterTilesLayerStyleFunction, 2);
            this.map.addLayer(this.occurrencesForWaterVectorTilesLayer);

            this.setTilesLayerVisbilility(this.mapDataType);
        },

        legibleColor: function (color) {
            return d3.hsl(color).l > 0.5 ? "#000" : "#fff"
        },

        createVectorTilesLayer: function (tileServerUrlTemplate, styleFunction, zIndex) {
            var vm = this;
            var l = new ol.layer.VectorTile({
                source: new ol.source.VectorTile({
                    format: new ol.format.MVT(),
                    url: tileServerUrlTemplate + '?' + $.param(vm.filters),
                }),
                opacity: vm.dataLayerOpacity,
                style: styleFunction,
                zIndex: zIndex
            });

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
            const baseLayer = new ol.layer.Tile({
                source: new ol.source.OSM({url: "https://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"}),
                zIndex: 1
            })

            const areasGroup = new ol.layer.Group({
                layers: this.areasOverlayCollection,
            })

            return new ol.Map({
                layers: [
                    baseLayer,
                    areasGroup
                ],
                view: new ol.View({
                    center: ol.proj.fromLonLat([this.initialLon, this.initialLat]),
                    zoom: this.initialZoom
                })
            });
        },
        refreshAreas: function () {
            let vm = this;
            this.areasOverlayCollection.clear();
            if (this.overlayId !== null) {
                $.ajax(this.overlayServerUrl.replace('{id}', this.overlayId.toString()))
                    .done(function (data) {
                        const vectorSource = new ol.source.Vector({
                            features: new ol.format.GeoJSON().readFeatures(data, {
                                dataProjection: "EPSG:4326",
                                featureProjection: "EPSG:3857",
                            }),
                        });

                        const vectorLayer = new ol.layer.Vector({
                            source: vectorSource,
                            style: new ol.style.Style({
                                stroke: new ol.style.Stroke({
                                    color: "red",
                                    width: 3,
                                }),
                            }),
                            zIndex: 3
                        });

                        vm.areasOverlayCollection.push(vectorLayer);
                    })
            }

        }
    },
    mounted() {
        this.map = this.createBaseMap();
        this.map.setTarget(this.$refs['map-root']); // Assign the map to div and display
        this.replaceVectorTilesLayers();
    },
    template: '<div id="map" class="map" ref="map-root" style="height: 500px; width: 100%;"></div>'
})