<template>
  <div class="space-y-8">
    <div>
      <h1 class="text-2xl font-semibold text-text-primary">Charts</h1>
      <p class="text-sm text-text-secondary">Explore top repositories based on different metrics.</p>
    </div>

    <!-- Chart Type Tabs -->
    <div class="border-b border-border-default">
      <nav class="flex space-x-6" aria-label="Tabs">
        <button
          v-for="tab in chartTabs"
          :key="tab.type"
          @click="activeChartType = tab.type"
          :class="[
            'px-3 py-2 font-medium text-sm rounded-t-lg',
            activeChartType === tab.type
              ? 'border-b-2 border-accent-primary text-accent-primary'
              : 'text-text-secondary hover:text-text-primary hover:bg-bg-secondary',
          ]"
        >
          {{ tab.name }}
        </button>
      </nav>
    </div>

    <div v-if="loading" class="space-y-6">
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <div v-for="i in 3" :key="i" class="skeleton h-48 rounded-2xl"></div>
      </div>
      <div class="skeleton h-64 rounded-2xl"></div>
    </div>

    <div v-else-if="error" class="flash flash-error">
      <p class="font-medium">{{ error }}</p>
      <button @click="fetchChartData" class="mt-2 text-sm underline">Retry</button>
    </div>

    <div v-else class="space-y-6">
      <!-- Top 3 Cards -->
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-4">
        <router-link
          v-for="(repo, index) in topThree"
          :key="repo.id"
          :to="`/repo/${repo.owner}/${repo.name}`"
          class="bg-bg-secondary border border-border-default rounded-2xl p-5 flex flex-col gap-4 hover:border-accent-tertiary hover:shadow-lg transition-all cursor-pointer group"
        >
          <div class="flex items-center justify-between text-xs text-text-tertiary">
            <span class="uppercase tracking-widest">Rank #{{ index + 1 }}</span>
          </div>
          <div class="flex items-center gap-3">
            <img :src="repo.avatar_url" :alt="repo.owner" class="w-12 h-12 rounded-xl bg-bg-tertiary object-cover" />
            <div class="min-w-0">
              <h3 class="text-lg font-semibold text-text-primary truncate group-hover:text-accent-tertiary transition-colors">{{ repo.name }}</h3>
              <p class="text-sm text-text-secondary truncate">{{ repo.description }}</p>
            </div>
          </div>
          <div class="flex items-center justify-between text-xs text-text-secondary">
            <span>{{ formatMetric(repo) }}</span>
            <span class="capitalize">{{ repo.primary_category || 'other' }}</span>
          </div>
          <div class="h-1 rounded-full bg-bg-tertiary">
             <div class="h-1 rounded-full bg-accent-primary" :style="{ width: '100%' }"></div>
          </div>
          <span class="text-xs text-accent-tertiary group-hover:underline">View details →</span>
        </router-link>
      </div>

      <!-- Rankings Table -->
      <div class="bg-bg-secondary border border-border-default rounded-2xl p-6">
        <div class="flex items-center justify-between mb-4">
          <h2 class="text-lg font-semibold text-text-primary">Top 100 {{ activeChartTab.name }}</h2>
          <span class="text-xs text-text-tertiary">Updated recently</span>
        </div>
        <div class="overflow-x-auto">
          <table class="min-w-full text-sm">
            <thead>
              <tr class="text-left text-text-tertiary border-b border-border-default">
                <th class="py-2 pr-4">Rank</th>
                <th class="py-2 pr-4">App</th>
                <th class="py-2 pr-4">Category</th>
                <th class="py-2 pr-4">{{ activeChartTab.metric_name }}</th>
                <th class="py-2">Action</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(repo, index) in restOfChart"
                :key="repo.id"
                class="border-b border-border-default last:border-b-0 hover:bg-bg-tertiary/50 cursor-pointer transition-colors"
                @click="$router.push(`/repo/${repo.owner}/${repo.name}`)"
              >
                <td class="py-3 pr-4 text-text-secondary">#{{ index + 4 }}</td>
                <td class="py-3 pr-4">
                  <div class="flex items-center gap-3">
                    <img :src="repo.avatar_url" :alt="repo.owner" class="w-8 h-8 rounded-lg bg-bg-tertiary object-cover" />
                    <div class="min-w-0">
                      <p class="font-medium text-text-primary truncate">{{ repo.name }}</p>
                      <p class="text-xs text-text-secondary truncate">{{ repo.full_name }}</p>
                    </div>
                  </div>
                </td>
                <td class="py-3 pr-4 text-text-secondary capitalize">{{ repo.primary_category || 'other' }}</td>
                <td class="py-3 pr-4 text-text-secondary">{{ formatMetric(repo) }}</td>
                <td class="py-3">
                  <span class="text-xs text-accent-tertiary">View →</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue';
import { repositoriesAPI } from '../services/api';
import { formatDistanceToNow } from 'date-fns';

const loading = ref(true);
const error = ref(null);
const repos = ref([]);
const activeChartType = ref('trending');

const chartTabs = [
  { type: 'trending', name: 'Trending', metric_name: 'Stars' },
  { type: 'stars', name: 'Stars', metric_name: 'Stars' },
  { type: 'downloads', name: 'Downloads', metric_name: 'Downloads' },
  { type: 'updated', name: 'Updated', metric_name: 'Last Updated' },
];

const activeChartTab = computed(() => chartTabs.find(tab => tab.type === activeChartType.value));

const topThree = computed(() => repos.value.slice(0, 3));
const restOfChart = computed(() => repos.value.slice(3));

const fetchChartData = async () => {
  loading.value = true;
  error.value = null;

  try {
    const data = await repositoriesAPI.getCharts(activeChartType.value, { limit: 100 });
    repos.value = data || [];
  } catch (err) {
    console.error(`Failed to load ${activeChartType.value} chart:`, err);
    error.value = err.message || 'Unable to load chart data.';
  }

  loading.value = false;
};

const formatNumber = (num) => {
  if (!num) return '0';
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'k';
  return num.toString();
};

const formatMetric = (repo) => {
  if (!repo) return 'N/A';
  switch (activeChartType.value) {
    case 'trending':
    case 'stars':
      return formatNumber(repo.stars);
    case 'downloads':
      return formatNumber(repo.total_downloads);
    case 'updated':
      return repo.github_updated_at ? `${formatDistanceToNow(new Date(repo.github_updated_at))} ago` : 'N/A';
    default:
      return '';
  }
};

watch(activeChartType, fetchChartData, { immediate: true });

onMounted(fetchChartData);
</script>
