if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('service-worker.js').then(registration => {
    registration.onupdatefound = () => {
      const newWorker = registration.installing;
      newWorker.onstatechange = () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          console.log('New version available. Reloading...');
          window.location.reload();
        }
      };
    };
  });
}
document.addEventListener('DOMContentLoaded', () => {
	// State management for the application
	const appState = {
		lists: [],
		currentListId: null,
		editing: {
			type: null, // 'list' or 'todo'
			listId: null,
			todoId: null,
		},
		// Callback function for confirmation modal
		confirmCallback: null,
		// Callback function for add list modal
		addListCallback: null,
	};

	// --- DOM Elements ---
	// Views
	const listsView = document.getElementById('lists-view');
	const listView = document.getElementById('list-view');

	// List View elements
	const incompleteListsContainer = document.getElementById('incomplete-lists');
	const completeListsContainer = document.getElementById('complete-lists');
	const addListBtn = document.getElementById('add-list-btn');

	// Overall Progress Elements (for lists view)
	const overallProgressBar = document.getElementById('overall-progress-bar');
	const overallProgressPercent = document.getElementById('overall-progress-percent');

	// Single List View elements
	const backToListsBtn = document.getElementById('back-to-lists');
	const listNameHeader = document.getElementById('list-name-header');
	const newTodoInput = document.getElementById('new-todo-input');
	const addTodoBtn = document.getElementById('add-todo-btn');
	const incompleteTodosContainer = document.getElementById('incomplete-todos');
	const completeTodosContainer = document.getElementById('complete-todos');
	const listProgressBar = document.getElementById('list-progress-bar');
	const listProgressPercent = document.getElementById('list-progress-percent');

	// Edit Modal elements
	const editModal = document.getElementById('edit-modal');
	const editInput = document.getElementById('edit-input');
	const saveEditBtn = document.getElementById('save-edit-btn');
	const cancelEditBtn = document.getElementById('cancel-edit-btn');

	// Add List Modal elements
	const addListModal = document.getElementById('add-list-modal');
	const addListInput = document.getElementById('add-list-input');
	const saveAddListBtn = document.getElementById('save-add-list-btn');
	const cancelAddListBtn = document.getElementById('cancel-add-list-btn');

	// Confirmation Modal elements
	const confirmModal = document.getElementById('confirm-modal');
	const confirmModalTitle = document.getElementById('confirm-modal-title');
	const confirmModalMessage = document.getElementById('confirm-modal-message');
	const proceedConfirmBtn = document.getElementById('proceed-confirm-btn');
	const cancelConfirmBtn = document.getElementById('cancel-confirm-btn');


	// --- Data Persistence and Daily Reset ---

	/**
	 * Checks if a daily reset is needed (at 2 AM local time) and resets todo completion status.
	 * Stores the last reset timestamp in local storage.
	 */
	function checkAndResetData() {
		const lastReset = localStorage.getItem('todoAppLastReset');
		const now = new Date();
		
		let shouldReset = false;
		
		if (!lastReset) {
			// If no last reset, it's the first run or data was cleared, so reset.
			shouldReset = true;
		} else {
			const lastResetDate = new Date(parseInt(lastReset, 10));
			const nextResetTime = new Date(lastResetDate);
			
			// Set next reset time to 2 AM of the next day relative to last reset
			nextResetTime.setDate(nextResetTime.getDate() + 1);
			nextResetTime.setHours(2, 0, 0, 0); // 2 AM

			// If current time is past the next reset time, then a reset is due
			if (now >= nextResetTime) {
				shouldReset = true;
			}
		}
		
		if (shouldReset) {
			console.log("Resetting todo completion status...");
			const data = localStorage.getItem('todoAppData');
			if (data) {
				let listsToReset = JSON.parse(data);
				listsToReset.forEach(list => {
					list.todos.forEach(todo => {
						todo.completed = false; // Mark all todos as incomplete
					});
				});
				localStorage.setItem('todoAppData', JSON.stringify(listsToReset));
			}
			
			// Set the new last reset timestamp to 2 AM of today (or now if it's before 2 AM)
			const todayAt2AM = new Date();
			todayAt2AM.setHours(2, 0, 0, 0);
			// If current time is before 2 AM, the reset effectively applies for "yesterday's" items,
			// so the timestamp should be from the previous day's 2 AM.
			if (now < todayAt2AM && !lastReset) { // Only adjust if it's the very first run before 2 AM
				todayAt2AM.setDate(todayAt2AM.getDate() - 1);
			}
			localStorage.setItem('todoAppLastReset', todayAt2AM.getTime().toString());
		}
	}

	/**
	 * Loads application data from local storage.
	 */
	function loadData() {
		checkAndResetData(); // First check and reset if necessary
		const data = localStorage.getItem('todoAppData');
		if (data) {
			appState.lists = JSON.parse(data);
		}
		render(); // Initial render after loading data
	}

	/**
	 * Saves current application state (lists) to local storage.
	 */
	function saveData() {
		localStorage.setItem('todoAppData', JSON.stringify(appState.lists));
	}

	// --- Core Application Logic ---

	/**
	 * Adds a new list to the application state.
	 * @param {string} name - The name of the new list.
	 */
	function addList(name) {
		const newList = {
			id: Date.now(), // Unique ID based on timestamp
			name: name,
			todos: [],
		};
		appState.lists.push(newList);
		saveData();
		render();
	}

	/**
	 * Adds a new to-do item to a specific list.
	 * @param {number} listId - The ID of the list to add the to-do to.
	 * @param {string} name - The name of the new to-do item.
	 */
	function addTodo(listId, name) {
		const list = appState.lists.find(l => l.id === listId);
		if (list) {
			const newTodo = {
				id: Date.now(), // Unique ID for the to-do
				name: name,
				completed: false,
			};
			list.todos.push(newTodo);
			saveData();
			render();
		}
	}

	/**
	 * Deletes a list from the application state.
	 * @param {number} listId - The ID of the list to delete.
	 */
	function deleteList(listId) {
		appState.lists = appState.lists.filter(l => l.id !== listId);
		saveData();
		render();
		// If the deleted list was the currently viewed one, go back to lists view
		if (appState.currentListId === listId) {
			showListsView();
		}
	}

	/**
	 * Deletes a to-do item from a specific list.
	 * @param {number} listId - The ID of the list containing the to-do.
	 * @param {number} todoId - The ID of the to-do to delete.
	 */
	function deleteTodo(listId, todoId) {
		const list = appState.lists.find(l => l.id === listId);
		if (list) {
			list.todos = list.todos.filter(t => t.id !== todoId);
			saveData();
			render();
		}
	}
	
	/**
	 * Toggles the completion status of a to-do item.
	 * @param {number} listId - The ID of the list containing the to-do.
	 * @param {number} todoId - The ID of the to-do to toggle.
	 */
	function toggleTodoStatus(listId, todoId) {
		const list = appState.lists.find(l => l.id === listId);
		if (list) {
			const todo = list.todos.find(t => t.id === todoId);
			if (todo) {
				todo.completed = !todo.completed;
				saveData();
				render(); // Re-render to update UI (e.g., strike-through, progress bars)
			}
		}
	}

	/**
	 * Updates the name of a list or a to-do item.
	 * @param {string} type - 'list' or 'todo'.
	 * @param {number} listId - The ID of the list.
	 * @param {number|null} todoId - The ID of the to-do (if type is 'todo').
	 * @param {string} newName - The new name.
	 */
	function updateName(type, listId, todoId, newName) {
		if (type === 'list') {
			const list = appState.lists.find(l => l.id === listId);
			if (list) list.name = newName;
		} else if (type === 'todo') {
			const list = appState.lists.find(l => l.id === listId);
			if (list) {
				const todo = list.todos.find(t => t.id === todoId);
				if (todo) todo.name = newName;
			}
		}
		saveData();
		render();
		closeEditModal(); // Close modal after saving
	}
	
	/**
	 * Calculates the progress (percentage, completed, total) for a given list.
	 * @param {object} list - The list object.
	 * @returns {object} - An object with percent, completed, and total.
	 */
	function calculateListProgress(list) {
		if (!list.todos || list.todos.length === 0) {
			return { percent: 0, completed: 0, total: 0 };
		}
		const completed = list.todos.filter(t => t.completed).length;
		const total = list.todos.length;
		const percent = Math.round((completed / total) * 100);
		return { percent, completed, total };
	}

	/**
	 * Calculates the overall progress across all lists.
	 * @returns {object} - An object with percent, completed, and total for all todos.
	 */
	function calculateOverallProgress() {
		let totalTodos = 0;
		let completedTodos = 0;

		appState.lists.forEach(list => {
			totalTodos += list.todos.length;
			completedTodos += list.todos.filter(t => t.completed).length;
		});

		if (totalTodos === 0) {
			return { percent: 0, completed: 0, total: 0 };
		}

		const percent = Math.round((completedTodos / totalTodos) * 100);
		return { percent, completed: completedTodos, total: totalTodos };
	}

	// --- View Navigation ---

	/**
	 * Shows the main lists view and hides the single list view.
	 */
	function showListsView() {
		appState.currentListId = null; // Clear current list selection
		listsView.classList.remove('hidden');
		listView.classList.add('hidden');
		render(); // Re-render lists view
	}

	/**
	 * Shows the single list view for a specific list.
	 * @param {number} listId - The ID of the list to display.
	 */
	function showListView(listId) {
		appState.currentListId = listId;
		listsView.classList.add('hidden');
		listView.classList.remove('hidden');
		render(); // Re-render single list view
	}

	// --- Rendering Functions ---

	/**
	 * Main render function that delegates to specific view renderers.
	 */
	function render() {
		if (appState.currentListId !== null) {
			renderSingleListView();
		} else {
			renderListsView();
		}
	}
	
	/**
	 * Renders the main lists view, including overall progress and individual list cards.
	 */
	function renderListsView() {
		// Update overall progress bar
		const overallProgress = calculateOverallProgress();
		overallProgressBar.style.width = `${overallProgress.percent}%`;
		overallProgressPercent.textContent = `${overallProgress.percent}%`;

		// Clear existing lists
		incompleteListsContainer.innerHTML = '';
		completeListsContainer.innerHTML = '';

		let hasIncomplete = false;
		let hasComplete = false;

		if (appState.lists.length === 0) {
			incompleteListsContainer.innerHTML = `<p class="text-gray-400">No lists yet. Create one to get started!</p>`;
		}

		appState.lists.forEach(list => {
			const progress = calculateListProgress(list);
			const listElement = document.createElement('div');
			listElement.className = 'bg-gray-800 p-4 rounded-lg shadow cursor-pointer list-item flex flex-col justify-between';
			listElement.dataset.listId = list.id;
			
			listElement.innerHTML = `
				<div>
					<div class="flex justify-between items-start">
						<h3 class="font-bold text-lg mb-2">${list.name}</h3>
						<div class="flex gap-2">
							<button class="edit-list-btn text-gray-400 hover:text-white" data-list-id="${list.id}">
								<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
							</button>
							<button class="delete-list-btn text-gray-400 hover:text-red-500" data-list-id="${list.id}">
								<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg>
							</button>
						</div>
					</div>
					<p class="text-gray-400 text-sm">${progress.completed} / ${progress.total} completed</p>
				</div>
				<div class="mt-4">
					<div class="w-full progress-bar-bg rounded-full h-2">
						<div class="bg-green-500 h-2 rounded-full" style="width: ${progress.percent}%"></div>
					</div>
				</div>
			`;

			// Append to appropriate container based on completion status
			if (progress.percent === 100 && progress.total > 0) {
				completeListsContainer.appendChild(listElement);
				hasComplete = true;
			} else {
				incompleteListsContainer.appendChild(listElement);
				hasIncomplete = true;
			}
		});

		// Show/hide sections based on content
		document.getElementById('incomplete-lists-container').style.display = hasIncomplete || appState.lists.length === 0 ? 'block' : 'none';
		document.getElementById('complete-lists-container').style.display = hasComplete ? 'block' : 'none';

		// Display "All lists are complete" message if no incomplete lists but some completed exist
		if (!hasIncomplete && appState.lists.length > 0 && hasComplete) {
			document.getElementById('incomplete-lists-container').style.display = 'block'; // Ensure the container is visible
			incompleteListsContainer.innerHTML = `<p class="text-gray-400">All lists are complete!</p>`;
		}
	}

	/**
	 * Renders the single list view, displaying to-dos for the currently selected list.
	 */
	function renderSingleListView() {
		const list = appState.lists.find(l => l.id === appState.currentListId);
		if (!list) {
			showListsView(); // Go back to lists view if list not found
			return;
		}

		listNameHeader.textContent = list.name;
		incompleteTodosContainer.innerHTML = '';
		completeTodosContainer.innerHTML = '';
		
		let hasIncomplete = false;
		let hasComplete = false;

		// Update list progress bar
		const progress = calculateListProgress(list);
		listProgressBar.style.width = `${progress.percent}%`;
		listProgressPercent.textContent = `${progress.percent}%`;

		if (list.todos.length === 0) {
			incompleteTodosContainer.innerHTML = `<p class="text-gray-400 text-center py-4">No to-dos in this list yet. Add one!</p>`;
			hasIncomplete = true; // Still show the section for adding new todos
		}

		list.todos.forEach(todo => {
			const todoElement = document.createElement('div');
			todoElement.className = 'flex items-center justify-between p-3 rounded-lg hover:bg-gray-700';
			todoElement.innerHTML = `
				<div class="flex items-center">
					<input type="checkbox" class="h-5 w-5 rounded bg-gray-900 border-gray-600 text-green-500 focus:ring-green-500 cursor-pointer" ${todo.completed ? 'checked' : ''} data-list-id="${list.id}" data-todo-id="${todo.id}">
					<span class="ml-3 ${todo.completed ? 'line-through text-gray-500' : ''}">${todo.name}</span>
				</div>
				<div class="flex items-center gap-3">
					<button class="edit-todo-btn text-gray-400 hover:text-white" data-list-id="${list.id}" data-todo-id="${todo.id}">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" /><path fill-rule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clip-rule="evenodd" /></svg>
					</button>
					<button class="delete-todo-btn text-gray-400 hover:text-red-500" data-list-id="${list.id}" data-todo-id="${todo.id}">
						<svg xmlns="http://www.w3.org/2000/svg" class="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm4 0a1 1 0 012 0v6a1 1 0 11-2 0V8z" clip-rule="evenodd" /></svg>
					</button>
				</div>
			`;
			
			if (todo.completed) {
				completeTodosContainer.appendChild(todoElement);
				hasComplete = true;
			} else {
				incompleteTodosContainer.appendChild(todoElement);
				hasIncomplete = true;
			}
		});

		// Show/hide sections based on content
		document.getElementById('incomplete-todos-container').style.display = hasIncomplete ? 'block' : 'none';
		document.getElementById('complete-todos-container').style.display = hasComplete ? 'block' : 'none';
	}
	
	// --- Modal Logic (replacing prompt/confirm) ---

	/**
	 * Opens the edit modal and populates it with the current name.
	 * @param {string} type - 'list' or 'todo'.
	 * @param {number} listId - The ID of the list.
	 * @param {number|null} todoId - The ID of the to-do (optional).
	 */
	function openEditModal(type, listId, todoId = null) {
		appState.editing = { type, listId, todoId };
		editModal.classList.remove('hidden'); // Show modal

		// Populate input with current name
		if (type === 'list') {
			const list = appState.lists.find(l => l.id === listId);
			editInput.value = list ? list.name : '';
		} else if (type === 'todo') {
			const list = appState.lists.find(l => l.id === listId);
			const todo = list ? list.todos.find(t => t.id === todoId) : null;
			editInput.value = todo ? todo.name : '';
		}
		editInput.focus(); // Focus on input field
	}

	/**
	 * Closes the edit modal and resets its state.
	 */
	function closeEditModal() {
		editModal.classList.add('hidden'); // Hide modal
		editInput.value = ''; // Clear input
		appState.editing = { type: null, listId: null, todoId: null }; // Reset editing state
	}

	/**
	 * Opens the add list modal.
	 */
	function openAddListModal() {
		addListModal.classList.remove('hidden');
		addListInput.value = ''; // Clear previous input
		addListInput.focus();
	}

	/**
	 * Closes the add list modal.
	 */
	function closeAddListModal() {
		addListModal.classList.add('hidden');
		addListInput.value = '';
		appState.addListCallback = null; // Clear callback
	}

	/**
	 * Opens the confirmation modal with a specific message and sets a callback.
	 * @param {string} message - The message to display in the confirmation modal.
	 * @param {function} callback - The function to call if confirmed (true) or cancelled (false).
	 * @param {string} [title="Confirm Action"] - Optional title for the modal.
	 */
	function openConfirmModal(message, callback, title = "Confirm Action") {
		confirmModalTitle.textContent = title;
		confirmModalMessage.textContent = message;
		appState.confirmCallback = callback; // Store the callback
		confirmModal.classList.remove('hidden'); // Show modal
	}

	/**
	 * Closes the confirmation modal.
	 */
	function closeConfirmModal() {
		confirmModal.classList.add('hidden'); // Hide modal
		appState.confirmCallback = null; // Clear the callback
	}

	// --- Event Listeners ---

	// Add New List button (opens modal instead of prompt)
	addListBtn.addEventListener('click', () => {
		openAddListModal();
	});

	// Add To-Do button (for current list view)
	addTodoBtn.addEventListener('click', () => {
		const todoName = newTodoInput.value.trim();
		if (todoName && appState.currentListId) {
			addTodo(appState.currentListId, todoName);
			newTodoInput.value = ''; // Clear input after adding
		}
	});
	
	// Allow adding to-do by pressing Enter key in the input field
	newTodoInput.addEventListener('keypress', (e) => {
		if (e.key === 'Enter') {
			addTodoBtn.click(); // Trigger click event on add button
		}
	});

	// Back to Lists button in single list view
	backToListsBtn.addEventListener('click', showListsView);

	// Event delegation for actions within the #app container (lists and todos)
	document.getElementById('app').addEventListener('click', (e) => {
		// Navigate to single list view when clicking on a list card (but not its buttons)
		const listItem = e.target.closest('.list-item');
		if (listItem && !e.target.closest('button')) {
			const listId = parseInt(listItem.dataset.listId, 10);
			showListView(listId);
			return; // Exit to prevent further processing
		}

		// Delete List button handler
		const deleteListBtn = e.target.closest('.delete-list-btn');
		if (deleteListBtn) {
			const listId = parseInt(deleteListBtn.dataset.listId, 10);
			openConfirmModal("Are you sure you want to delete this list and all its to-dos?", (confirmed) => {
				if (confirmed) {
					deleteList(listId);
				}
			}, "Delete List");
			return;
		}
		
		// Edit List button handler
		const editListBtn = e.target.closest('.edit-list-btn');
		if (editListBtn) {
			const listId = parseInt(editListBtn.dataset.listId, 10);
			openEditModal('list', listId);
			return;
		}

		// Delete Todo button handler
		const deleteTodoBtn = e.target.closest('.delete-todo-btn');
		if (deleteTodoBtn) {
			const listId = parseInt(deleteTodoBtn.dataset.listId, 10);
			const todoId = parseInt(deleteTodoBtn.dataset.todoId, 10);
			openConfirmModal("Are you sure you want to delete this to-do?", (confirmed) => {
				if (confirmed) {
					deleteTodo(listId, todoId);
				}
			}, "Delete To-Do");
			return;
		}
		
		// Edit Todo button handler
		const editTodoBtn = e.target.closest('.edit-todo-btn');
		if (editTodoBtn) {
			const listId = parseInt(editTodoBtn.dataset.listId, 10);
			const todoId = parseInt(editTodoBtn.dataset.todoId, 10);
			openEditModal('todo', listId, todoId);
			return;
		}
		
		// Toggle Todo Completion (checkbox) handler
		const checkbox = e.target.closest('input[type="checkbox"]');
		if (checkbox) {
			const listId = parseInt(checkbox.dataset.listId, 10);
			const todoId = parseInt(checkbox.dataset.todoId, 10);
			toggleTodoStatus(listId, todoId);
		}
	});
	
	// --- Modal Event Listeners ---

	// Edit Modal: Save button
	saveEditBtn.addEventListener('click', () => {
		const { type, listId, todoId } = appState.editing;
		const newName = editInput.value.trim();
		if (newName) {
			updateName(type, listId, todoId, newName);
		} else {
			// Optionally, show a warning if name is empty
			console.warn("Name cannot be empty.");
		}
	});

	// Edit Modal: Cancel button
	cancelEditBtn.addEventListener('click', closeEditModal);

	// Edit Modal: Allow Enter key to save
	editInput.addEventListener('keypress', (e) => {
		if (e.key === 'Enter') {
			saveEditBtn.click();
		}
	});

	// Add List Modal: Save button
	saveAddListBtn.addEventListener('click', () => {
		const listName = addListInput.value.trim();
		if (listName) {
			addList(listName);
			closeAddListModal();
		} else {
			console.warn("List name cannot be empty.");
		}
	});

	// Add List Modal: Cancel button
	cancelAddListBtn.addEventListener('click', closeAddListModal);

	// Add List Modal: Allow Enter key to save
	addListInput.addEventListener('keypress', (e) => {
		if (e.key === 'Enter') {
			saveAddListBtn.click();
		}
	});

	// Confirm Modal: Proceed button
	proceedConfirmBtn.addEventListener('click', () => {
		if (appState.confirmCallback) {
			appState.confirmCallback(true); // Call callback with true (confirmed)
		}
		closeConfirmModal();
	});

	// Confirm Modal: Cancel button
	cancelConfirmBtn.addEventListener('click', () => {
		if (appState.confirmCallback) {
			appState.confirmCallback(false); // Call callback with false (cancelled)
		}
		closeConfirmModal();
	});

	// --- Initial Load ---
	loadData(); // Load data and render UI when the page loads
});
