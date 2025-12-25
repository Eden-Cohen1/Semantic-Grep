<template>
  <div class="complex-component">
    <h1>{{ title }}</h1>
    <p>Count: {{ count }}</p>
    <p>Doubled: {{ doubled }}</p>
    <input v-model="searchQuery" placeholder="Search..." />
  </div>
</template>

<script lang="ts">
export default {
  name: 'ComplexComponent',

  props: {
    initialCount: {
      type: Number,
      default: 0
    },
    title: {
      type: String,
      required: true
    }
  },

  emits: ['update', 'delete', 'save'],

  data() {
    return {
      count: this.initialCount,
      searchQuery: '',
      items: []
    };
  },

  computed: {
    doubled() {
      return this.count * 2;
    },

    tripled() {
      return this.count * 3;
    },

    filteredItems() {
      return this.items.filter(item =>
        item.toLowerCase().includes(this.searchQuery.toLowerCase())
      );
    }
  },

  watch: {
    count(newVal, oldVal) {
      console.log(`Count changed from ${oldVal} to ${newVal}`);
      this.$emit('update', newVal);
    },

    searchQuery(newQuery) {
      console.log('Search query changed:', newQuery);
    }
  },

  methods: {
    increment() {
      this.count++;
    },

    decrement() {
      this.count--;
    },

    reset: function() {
      this.count = 0;
    },

    handleSave: () => {
      console.log('Saving...');
    },

    async fetchData() {
      const response = await fetch('/api/data');
      this.items = await response.json();
    }
  },

  beforeCreate() {
    console.log('beforeCreate hook');
  },

  created() {
    console.log('created hook');
    this.fetchData();
  },

  beforeMount() {
    console.log('beforeMount hook');
  },

  mounted() {
    console.log('mounted hook');
  },

  beforeUpdate() {
    console.log('beforeUpdate hook');
  },

  updated() {
    console.log('updated hook');
  },

  beforeUnmount() {
    console.log('beforeUnmount hook');
  },

  unmounted() {
    console.log('unmounted hook');
  }
};
</script>

<style scoped>
.complex-component {
  padding: 20px;
  max-width: 600px;
  margin: 0 auto;
}

input {
  width: 100%;
  padding: 8px;
  margin: 10px 0;
}
</style>
