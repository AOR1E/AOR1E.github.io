(function () {
  "use strict";

  var datasetPromise = null;
  var storageKey = "aor1e-workout-preferences";
  var equipmentGroups = {
    bodyweight: ["body weight"],
    dumbbell: ["body weight", "dumbbell"],
    gym: [
      "body weight", "dumbbell", "barbell", "cable", "leverage machine",
      "smith machine", "kettlebell", "ez barbell", "band", "resistance band"
    ]
  };
  var labels = {
    bodyParts: {
      "upper arms": "手臂", "upper legs": "腿部", back: "背部", waist: "核心",
      chest: "胸部", shoulders: "肩部", "lower legs": "小腿", cardio: "心肺"
    },
    equipment: {
      "body weight": "徒手", dumbbell: "哑铃", barbell: "杠铃", cable: "绳索",
      "leverage machine": "固定器械", "smith machine": "史密斯机", kettlebell: "壶铃",
      "ez barbell": "曲杆", band: "弹力带", "resistance band": "阻力带"
    }
  };
  var templates = {
    3: [
      { name: "全身 A", parts: ["upper legs", "chest", "back", "shoulders", "waist"] },
      { name: "全身 B", parts: ["upper legs", "back", "chest", "upper arms", "cardio"] },
      { name: "全身 C", parts: ["upper legs", "shoulders", "back", "upper arms", "waist"] }
    ],
    4: [
      { name: "上肢 A", parts: ["chest", "back", "shoulders", "upper arms", "waist"] },
      { name: "下肢 A", parts: ["upper legs", "lower legs", "upper legs", "waist", "cardio"] },
      { name: "上肢 B", parts: ["back", "chest", "upper arms", "shoulders", "waist"] },
      { name: "下肢 B", parts: ["upper legs", "lower legs", "upper legs", "waist", "cardio"] }
    ],
    5: [
      { name: "推", parts: ["chest", "shoulders", "upper arms", "chest", "waist"] },
      { name: "拉", parts: ["back", "upper arms", "back", "shoulders", "waist"] },
      { name: "腿", parts: ["upper legs", "lower legs", "upper legs", "waist", "cardio"] },
      { name: "上肢", parts: ["chest", "back", "shoulders", "upper arms", "waist"] },
      { name: "全身", parts: ["upper legs", "chest", "back", "upper arms", "cardio"] }
    ]
  };
  var preferredTerms = [
    "squat", "lunge", "deadlift", "leg press", "bench press", "chest press",
    "push-up", "push up", "pull-up", "pull up", "bent over row", "seated row",
    "pulldown", "shoulder press", "overhead press", "lateral raise", "biceps curl",
    "triceps extension", "plank", "crunch", "calf raise", "mountain climber", "burpee", "run"
  ];
  var advancedTerms = [
    "behind head", "behind neck", "snatch", "clean and press", "back lever", "front lever",
    "planche", "handstand", "muscle-up", "one arm pull", "one arm push", "depth jump",
    "plyo", "weighted pull", "weighted push"
  ];

  function loadDataset(url) {
    if (!datasetPromise) {
      datasetPromise = fetch(url, { credentials: "same-origin" })
        .then(function (response) {
          if (!response.ok) throw new Error("动作数据加载失败");
          return response.json();
        })
        .then(function (payload) { return payload.exercises || []; });
    }
    return datasetPromise;
  }

  function scoreExercise(exercise, level) {
    var name = exercise.name.toLowerCase();
    var score = 0;
    preferredTerms.forEach(function (term) {
      if (name.indexOf(term) !== -1) score += 5;
    });
    advancedTerms.forEach(function (term) {
      if (name.indexOf(term) !== -1) score -= level === "beginner" ? 30 : 10;
    });
    if (name.indexOf("stretch") !== -1) score -= 12;
    if (name.indexOf("v. 2") !== -1 || name.indexOf("pov") !== -1) score -= 5;
    if (exercise.equipment === "body weight" || exercise.equipment === "dumbbell") score += 2;
    score -= Math.max(0, name.length - 34) / 10;
    return score + Math.random() * 2;
  }

  function chooseExercise(exercises, part, allowedEquipment, used, level) {
    var candidates = exercises.filter(function (exercise) {
      return exercise.bodyPart === part &&
        allowedEquipment.indexOf(exercise.equipment) !== -1 &&
        !used.has(exercise.id);
    });

    if (!candidates.length) {
      candidates = exercises.filter(function (exercise) {
        return exercise.bodyPart === part && allowedEquipment.indexOf(exercise.equipment) !== -1;
      });
    }
    candidates = candidates.map(function (exercise) {
      return { exercise: exercise, score: scoreExercise(exercise, level) };
    }).sort(function (a, b) {
      return b.score - a.score;
    }).map(function (entry) {
      return entry.exercise;
    });
    var shortList = candidates.slice(0, Math.min(10, candidates.length));
    var choice = shortList[Math.floor(Math.random() * shortList.length)];
    if (choice) used.add(choice.id);
    return choice;
  }

  function prescription(goal, bodyPart) {
    if (bodyPart === "cardio") {
      return goal === "strength" ? "3 轮 × 30 秒" : "4 轮 × 30–45 秒";
    }
    if (goal === "strength") return "4 组 × 4–6 次";
    if (goal === "conditioning") return "3 组 × 12–20 次";
    return "3–4 组 × 8–12 次";
  }

  function buildPlan(exercises, values) {
    var used = new Set();
    var allowed = equipmentGroups[values.equipment];
    var exerciseCount = values.level === "beginner" ? 4 : 5;
    return templates[values.days].map(function (day, index) {
      var selected = day.parts.slice(0, exerciseCount).map(function (part) {
        return chooseExercise(exercises, part, allowed, used, values.level);
      }).filter(Boolean);
      return { index: index + 1, name: day.name, exercises: selected };
    });
  }

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (typeof text === "string") node.textContent = text;
    return node;
  }

  function renderPlan(container, plan, values) {
    var fragment = document.createDocumentFragment();
    plan.forEach(function (day) {
      var card = element("section", "workout-day");
      var heading = element("h3", "workout-day__title", "第 " + day.index + " 天 · " + day.name);
      var list = element("ol", "workout-day__list");
      card.appendChild(heading);

      day.exercises.forEach(function (exercise) {
        var item = element("li", "workout-exercise");
        item.appendChild(element("span", "workout-exercise__name", exercise.name));
        item.appendChild(element(
          "span",
          "workout-exercise__meta",
          (labels.bodyParts[exercise.bodyPart] || exercise.bodyPart) + " · " +
          (labels.equipment[exercise.equipment] || exercise.equipment) + " · " +
          exercise.target
        ));
        item.appendChild(element("span", "workout-exercise__dose", prescription(values.goal, exercise.bodyPart)));
        list.appendChild(item);
      });

      card.appendChild(list);
      fragment.appendChild(card);
    });
    container.replaceChildren(fragment);
    container.hidden = false;
  }

  function readValues(form) {
    return {
      goal: form.elements.goal.value,
      level: form.elements.level.value,
      days: Number(form.elements.days.value),
      equipment: form.elements.equipment.value
    };
  }

  function restoreValues(form) {
    try {
      var saved = JSON.parse(localStorage.getItem(storageKey) || "null");
      if (!saved) return;
      ["goal", "level", "days", "equipment"].forEach(function (name) {
        if (saved[name] !== undefined) form.elements[name].value = String(saved[name]);
      });
    } catch (error) {}
  }

  function initPlanner() {
    var root = document.querySelector("[data-workout-planner]");
    if (!root || root.dataset.ready === "true") return;
    root.dataset.ready = "true";

    var form = root.querySelector("[data-workout-form]");
    var status = root.querySelector("[data-workout-status]");
    var result = root.querySelector("[data-workout-result]");
    var button = form.querySelector('button[type="submit"]');
    restoreValues(form);

    form.addEventListener("submit", function (event) {
      event.preventDefault();
      var values = readValues(form);
      button.disabled = true;
      button.textContent = "生成中…";
      status.textContent = "正在从动作库中组合计划…";

      loadDataset(root.dataset.datasetUrl).then(function (exercises) {
        var plan = buildPlan(exercises, values);
        renderPlan(result, plan, values);
        status.textContent = "已生成 " + values.days + " 天计划，点击按钮可重新随机组合。";
        try { localStorage.setItem(storageKey, JSON.stringify(values)); } catch (error) {}
      }).catch(function () {
        status.textContent = "动作数据暂时无法加载，请稍后重试。";
      }).finally(function () {
        button.disabled = false;
        button.textContent = "重新生成";
      });
    });
  }

  initPlanner();
  document.addEventListener("site:navigation-complete", initPlanner);
})();
