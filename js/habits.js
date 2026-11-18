/**
 * Habit-Tracker & Tages-Streak-Verwaltung (localStorage)
 */
const HABITS_KEY = 'flowvault_habits_v1';

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export class HabitTracker {
  constructor() {
    this.habits = this.load();
  }

  load() {
    try {
      const raw = localStorage.getItem(HABITS_KEY);
      if (!raw) {
        const defaults = [
          { id: 'h_1', title: '2 Liter Wasser trinken', completedDates: [] },
          { id: 'h_2', title: '25 Min. fokussiert arbeiten', completedDates: [] },
          { id: 'h_3', title: '15 Min. Lesen oder Bewegung', completedDates: [] }
        ];
        this.save(defaults);
        return defaults;
      }
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  save(list = this.habits) {
    this.habits = list;
    localStorage.setItem(HABITS_KEY, JSON.stringify(this.habits));
  }

  add(title) {
    const clean = title.trim();
    if (!clean) return;
    this.habits.push({
      id: 'h_' + Date.now().toString(36),
      title: clean,
      completedDates: []
    });
    this.save();
  }

  toggleToday(id) {
    const habit = this.habits.find((h) => h.id === id);
    if (!habit) return;
    const today = todayISO();
    const idx = habit.completedDates.indexOf(today);
    if (idx >= 0) {
      habit.completedDates.splice(idx, 1);
    } else {
      habit.completedDates.push(today);
    }
    this.save();
  }

  delete(id) {
    this.habits = this.habits.filter((h) => h.id !== id);
    this.save();
  }

  isDoneToday(habit) {
    return habit.completedDates.includes(todayISO());
  }

  getStreak(habit) {
    let streak = 0;
    const d = new Date();
    if (!habit.completedDates.includes(todayISO())) {
      d.setDate(d.getDate() - 1);
    }
    while (true) {
      const iso = d.toISOString().slice(0, 10);
      if (habit.completedDates.includes(iso)) {
        streak++;
        d.setDate(d.getDate() - 1);
      } else {
        break;
      }
    }
    return streak;
  }

  getLast7Days(habit) {
    const names = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'];
    const result = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const iso = d.toISOString().slice(0, 10);
      result.push({
        label: names[d.getDay()],
        hit: habit.completedDates.includes(iso)
      });
    }
    return result;
  }
}
