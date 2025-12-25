<template>
  <div class="counter">
    <h1>{{ message }}</h1>
    <p>Count: {{ count }}</p>
    <p>Doubled: {{ doubled }}</p>
    <button @click="increment">Increment</button>
    <button @click="decrement">Decrement</button>
  </div>
</template>

<script>
export default {
  name: 'Counter',

  data() {
    return {
      count: 0,
      message: 'Hello Vue!'
    };
  },

  computed: {
    doubled() {
      return this.count * 2;
    },
    tripled() {
      return this.count * 3;
    }
  },

  methods: {
    increment() {
      this.count++;
    },
    decrement() {
      this.count--;
    },
    reset() {
      this.count = 0;
    }
  },

  mounted() {
    console.log('Component mounted');
  },

  beforeDestroy() {
    console.log('Component will be destroyed');
  }
};
</script>

<style scoped>
.counter {
  padding: 20px;
}

button {
  margin: 5px;
}
</style>
