Vue.component('dashboard-map', {
    props: ['occurrences', 'initialLat', 'initialLon', 'initialZoom'],
    data: function () {
        return {
            clusterStyleCache: {}
        }
    },
    computed: {
        vectorSource: function () {
            var vm = this;
            var vectorSource = new ol.source.Vector({
                loader: function (extent, resolution, projection) {
                    var allFeatures = []
                    vm.occurrences.forEach(function (occ) {
                        allFeatures.push(new ol.Feature({
                            geometry: new ol.geom.Point(ol.proj.fromLonLat([occ.lon, occ.lat]))
                        }))
                    });
                    vectorSource.addFeatures(allFeatures);
                }
            });

            return vectorSource;
        },
        clusterSource: function () {
            return new ol.source.Cluster({
                distance: 40,
                source: this.vectorSource,
            });
        },

        clusterLayer: function () {
            var vm = this;

            return new ol.layer.Vector({
                source: this.clusterSource,
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
        },
        heatmapLayer: function () {
            return new ol.layer.Heatmap({
                source: this.vectorSource,
                blur: 20,
                radius: 2,
            });
        },
        baseLayer: function () {
            return new ol.layer.Tile({
                source: new ol.source.OSM({url: "http://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"})
            })
        }
    },
    methods: {
        initializeMap: function (target) {
            new ol.Map({
                target: target,
                layers: [
                    this.baseLayer,
                    this.clusterLayer,
                    this.heatmapLayer
                ],
                view: new ol.View({
                    center: ol.proj.fromLonLat([this.initialLon, this.initialLat]),
                    zoom: this.initialZoom
                })
            });
        }
    },
    mounted() {
        this.initializeMap(this.$refs['map-root']);
    },
    template: '<div id="map" class="map" ref="map-root" style="height: 640px; width: 100%;"></div>'
})