Vue.component('dashboard-map', {
    props: ['occurrencesCsvUrl'],
    data: function () {
        return {}
    },
    mounted() {
        var vm = this;
        var vectorSource = new ol.source.Vector({
            loader: function (extent, resolution, projection) {

                $.ajax({
                    url: vm.occurrencesCsvUrl,
                    dataType: "text"
                }).done(function (data) {
                    var dataArray = data.split('\n');
                    var allFeatures = []
                    dataArray.forEach(function (row) {
                        var splitted = row.split(',')
                        var id = splitted[0];
                        var lon = splitted[1];
                        var lat = splitted[2];

                        allFeatures.push(new ol.Feature({
                            geometry: new ol.geom.Point(ol.proj.fromLonLat([lon, lat]))
                        }))
                    });
                    vectorSource.addFeatures(allFeatures);
                });
            }
        });

        var clusterSource = new ol.source.Cluster({
            distance: 40,
            source: vectorSource,
        });

        var styleCache = {};
        var clusterLayer = new ol.layer.Vector({
            source: clusterSource,
            style: function (feature) {
                var size = feature.get('features').length;
                var style = styleCache[size];
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
                    styleCache[size] = style;
                }
                return style;
            },
        });

        var heatmapLayer = new ol.layer.Heatmap({
            source: vectorSource,
            blur: 20,
            radius: 2,

        });

        var map = new ol.Map({
            target: this.$refs['map-root'],
            layers: [
                new ol.layer.Tile({
                    source: new ol.source.OSM({url: "http://a.tile.openstreetmap.fr/hot/{z}/{x}/{y}.png"})
                }),
                clusterLayer,
                heatmapLayer
            ],
            view: new ol.View({
                center: ol.proj.fromLonLat([4.67, 50.63]),
                zoom: 8
            })
        });
    },
    template: '<div id="map" class="map" ref="map-root" style="height: 640px; width: 100%;"></div>'
})