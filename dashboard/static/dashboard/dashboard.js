Vue.component('dashboard-map', {
  data: function () {
    return {
      count: 0
    }
  },
  template: '<button v-on:click="count++">You clicked1 me {{ count }} times.</button>'
})