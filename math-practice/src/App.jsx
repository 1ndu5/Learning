import { useState, useEffect, useRef } from 'react';
import db from './instantdb';

function App() {
  // InstantDB auth hook
  const { user, isLoading: authLoading } = db.useAuth();
  
  // View state
  const [view, setView] = useState('setup');
  const [currentWorksheet, setCurrentWorksheet] = useState(null);
  const [worksheetId, setWorksheetId] = useState(null);
  const [quickGradeWrong, setQuickGradeWrong] = useState('');
  const [quickGradeIncomplete, setQuickGradeIncomplete] = useState('');
  const [selectedWorksheetToGrade, setSelectedWorksheetToGrade] = useState('');
  const [gradingHistory, setGradingHistory] = useState([]);

  // User management
  const [users, setUsers] = useState(['Default']);
  const [currentUser, setCurrentUser] = useState('Default');
  const [showUserModal, setShowUserModal] = useState(false);
  const [newUserName, setNewUserName] = useState('');
  const [editingUsers, setEditingUsers] = useState(false);
  const [showBackupModal, setShowBackupModal] = useState(false);

  // Question categories
  const [categories, setCategories] = useState({
    numberBonds5: false,
    numberBonds10: false,
    numberBonds100: false,
    additionSingle: false,
    additionDoubleNoCarry: false,
    additionDoubleCarry: false,
    subtractionSingle: false,
    subtractionDoubleNoCarry: false,
    subtractionDoubleCarry: false,
    multiplication: [],
    division: []
  });

  const [adaptiveWeight, setAdaptiveWeight] = useState(0.5);
  const [allUserData, setAllUserData] = useState({});
  const [savedWorksheets, setSavedWorksheets] = useState({});
  const [metaUpdatedAt, setMetaUpdatedAt] = useState({ users: null, allUserData: null, savedWorksheets: null });
  const [deletedItems, setDeletedItems] = useState({ users: {}, worksheets: {} });
  const [worksheetDisplayCount, setWorksheetDisplayCount] = useState(5);
  const [statsDisplayCount, setStatsDisplayCount] = useState(20);
  const lastSyncedData = useRef({ users: null, allUserData: null, savedWorksheets: null, metaUpdatedAt: null, deletedItems: null });
  const hasLoadedFromCloud = useRef(false);

  // InstantDB query for cloud data - must be unconditional (Rules of Hooks)
  const { data: cloudData, isLoading: cloudLoading } = db.useQuery(
    user ? { userData: { $: { where: { id: user.id } } } } : { userData: {} }
  );

  // Load data from localStorage on mount
  useEffect(() => {
    const savedUsers = localStorage.getItem('mathPracticeUsers');
    const savedData = localStorage.getItem('mathPracticeAllData');
    const savedSheets = localStorage.getItem('mathPracticeSavedWorksheets');
    const savedMeta = localStorage.getItem('mathPracticeMeta');
    const savedDeleted = localStorage.getItem('mathPracticeDeleted');

    if (savedUsers) {
      const parsedUsers = JSON.parse(savedUsers);
      setUsers(parsedUsers);
      if (parsedUsers.length > 0 && !parsedUsers.includes(currentUser)) {
        setCurrentUser(parsedUsers[0]);
      }
    }

    if (savedData) setAllUserData(JSON.parse(savedData));
    if (savedSheets) setSavedWorksheets(JSON.parse(savedSheets));
    if (savedMeta) {
      try {
        setMetaUpdatedAt(JSON.parse(savedMeta));
      } catch (e) {
        console.warn('Could not parse meta info', e);
      }
    }
    if (savedDeleted) {
      try {
        setDeletedItems(JSON.parse(savedDeleted));
      } catch (e) {
        console.warn('Could not parse deleted items', e);
      }
    }
  }, []);

  // Load categories for current user
  useEffect(() => {
    const savedCategories = localStorage.getItem(`categories-${currentUser}`);
    if (savedCategories) {
      setCategories(JSON.parse(savedCategories));
    }
  }, [currentUser]);

  // Authentication functions
  const handleLogin = async () => {
    const email = prompt('Enter your email to receive a login code:');
    if (!email) return;

    try {
      await db.auth.sendMagicCode({ email });
      const code = prompt('Check your email and enter the code you received:');
      if (!code) return;

      await db.auth.signInWithMagicCode({ email, code });
      alert('Successfully signed in!');
    } catch (err) {
      alert(`Could not sign in: ${err.message || 'Unknown error'}`);
      console.error('Login error:', err);
    }
  };

  const handleLogout = async () => {
    try {
      await db.auth.signOut();
    } catch (err) {
      console.warn('Sign out failed', err);
    }
  };
  
  // Data management helpers
  const touchMeta = (key) => {
    const now = new Date().toISOString();
    setMetaUpdatedAt(prev => {
      const next = { ...prev, [key]: now };
      localStorage.setItem('mathPracticeMeta', JSON.stringify(next));
      // Also update the ref so sync knows about this change
      lastSyncedData.current.metaUpdatedAt = { ...next };
      return next;
    });
    return now;
  };

  const getCurrentUserData = () => {
    return allUserData[currentUser] || { questionHistory: {} };
  };

  const saveUserData = (userData) => {
    const stamped = { ...userData, updatedAt: new Date().toISOString() };
    const newAllData = { ...allUserData, [currentUser]: stamped };
    setAllUserData(newAllData);
    localStorage.setItem('mathPracticeAllData', JSON.stringify(newAllData));
    touchMeta('allUserData');
  };

  const saveUsers = (userList) => {
    setUsers(userList);
    localStorage.setItem('mathPracticeUsers', JSON.stringify(userList));
    touchMeta('users');
  };

  const saveWorksheets = (worksheets) => {
    const now = new Date().toISOString();
    Object.values(worksheets).forEach(userWs => {
      Object.values(userWs || {}).forEach(ws => {
        if (!ws.updatedAt) ws.updatedAt = ws.createdAt || now;
      });
    });
    setSavedWorksheets(worksheets);
    localStorage.setItem('mathPracticeSavedWorksheets', JSON.stringify(worksheets));
    touchMeta('savedWorksheets');
  };

  // User management
  const addUser = () => {
    if (newUserName.trim() && !users.includes(newUserName.trim())) {
      const updatedUsers = [...users, newUserName.trim()];
      saveUsers(updatedUsers);
      
      // If this user was previously deleted, remove from tombstone list
      if (deletedItems.users[newUserName.trim()]) {
        const newDeleted = {
          ...deletedItems,
          users: { ...deletedItems.users }
        };
        delete newDeleted.users[newUserName.trim()];
        setDeletedItems(newDeleted);
        localStorage.setItem('mathPracticeDeleted', JSON.stringify(newDeleted));
      }
      
      setCurrentUser(newUserName.trim());
      setWorksheetDisplayCount(5);
      setStatsDisplayCount(20);
      setNewUserName('');
      setShowUserModal(false);
    } else {
      alert('Please enter a unique name');
    }
  };

  const deleteUser = (userName) => {
    if (users.length === 1) {
      alert('Cannot delete the last user');
      return;
    }
    if (window.confirm(`Are you sure you want to delete ${userName} and all their data?`)) {
      const updatedUsers = users.filter(u => u !== userName);
      saveUsers(updatedUsers);

      const newAllData = { ...allUserData };
      delete newAllData[userName];
      setAllUserData(newAllData);
      localStorage.setItem('mathPracticeAllData', JSON.stringify(newAllData));

      const newWorksheets = { ...savedWorksheets };
      delete newWorksheets[userName];
      saveWorksheets(newWorksheets);

      // Track deletion
      const newDeleted = {
        ...deletedItems,
        users: {
          ...deletedItems.users,
          [userName]: new Date().toISOString()
        }
      };
      setDeletedItems(newDeleted);
      localStorage.setItem('mathPracticeDeleted', JSON.stringify(newDeleted));

      if (currentUser === userName) {
        setCurrentUser(updatedUsers[0]);
      }
    }
  };

  // Backup functions
  const handleExport = () => {
    const exportData = {
      users,
      allUserData,
      savedWorksheets,
      metaUpdatedAt,
      exportedAt: new Date().toISOString(),
      version: '1.0'
    };
    
    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `math-practice-backup-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    
    alert('Backup exported successfully!');
  };

  const handleImport = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const importData = JSON.parse(e.target.result);
        
        // Validate the data has expected structure
        if (!importData.users || !importData.allUserData || !importData.savedWorksheets) {
          alert('Invalid backup file format');
          return;
        }

        if (window.confirm('This will replace all current data with the backup. Are you sure?')) {
          // Update all state
          setUsers(importData.users);
          setAllUserData(importData.allUserData);
          setSavedWorksheets(importData.savedWorksheets);
          setMetaUpdatedAt(importData.metaUpdatedAt || { users: null, allUserData: null, savedWorksheets: null });
          
          // Update localStorage
          localStorage.setItem('mathPracticeUsers', JSON.stringify(importData.users));
          localStorage.setItem('mathPracticeAllData', JSON.stringify(importData.allUserData));
          localStorage.setItem('mathPracticeSavedWorksheets', JSON.stringify(importData.savedWorksheets));
          localStorage.setItem('mathPracticeMeta', JSON.stringify(importData.metaUpdatedAt || {}));
          
          // Update lastSyncedData ref
          lastSyncedData.current = {
            users: JSON.parse(JSON.stringify(importData.users)),
            allUserData: JSON.parse(JSON.stringify(importData.allUserData)),
            savedWorksheets: JSON.parse(JSON.stringify(importData.savedWorksheets)),
            metaUpdatedAt: JSON.parse(JSON.stringify(importData.metaUpdatedAt || {}))
          };
          
          alert('Data imported successfully!');
          setShowBackupModal(false);
          
          // Reset current user if needed
          if (!importData.users.includes(currentUser)) {
            setCurrentUser(importData.users[0]);
          }
        }
      } catch (err) {
        alert('Error reading backup file: ' + err.message);
      }
    };
    reader.readAsText(file);
    
    // Reset the input
    event.target.value = '';
  };

  // Question generation helpers
  const generateQuestionKey = (q) => {
    return `${q.type}:${q.display}`;
  };

  const getQuestionStats = (key) => {
    const userData = getCurrentUserData();
    const history = userData.questionHistory[key] || { attempts: [], totalAsked: 0, totalCorrect: 0 };
    const recentAttempts = history.attempts.slice(-20);
    const recentCorrect = recentAttempts.filter(a => a).length;
    const recentPercentage = recentAttempts.length > 0 ? (recentCorrect / recentAttempts.length) : 1;
    return { ...history, recentPercentage, recentAttempts: recentAttempts.length };
  };

  // Question generators
  const generateNumberBond5 = () => {
    const target = 5;
    const a = Math.floor(Math.random() * 6);
    const b = target - a;
    const formats = [
      { display: `${a} + ___ = ${target}`, answer: b, type: 'numberBonds5' },
      { display: `${target} - ${a} = ___`, answer: b, type: 'numberBonds5' },
      { display: `${target} - ___ = ${a}`, answer: b, type: 'numberBonds5' }
    ];
    return formats[Math.floor(Math.random() * formats.length)];
  };

  const generateNumberBond10 = () => {
    const target = 10;
    const a = Math.floor(Math.random() * 11);
    const b = target - a;
    const formats = [
      { display: `${a} + ___ = ${target}`, answer: b, type: 'numberBonds10' },
      { display: `${target} - ${a} = ___`, answer: b, type: 'numberBonds10' },
      { display: `${target} - ___ = ${a}`, answer: b, type: 'numberBonds10' }
    ];
    return formats[Math.floor(Math.random() * formats.length)];
  };

  const generateNumberBond100 = () => {
    const target = 100;
    const a = Math.floor(Math.random() * 11) * 10;
    const b = target - a;
    const formats = [
      { display: `${a} + ___ = ${target}`, answer: b, type: 'numberBonds100' },
      { display: `${target} - ${a} = ___`, answer: b, type: 'numberBonds100' },
      { display: `${target} - ___ = ${a}`, answer: b, type: 'numberBonds100' }
    ];
    return formats[Math.floor(Math.random() * formats.length)];
  };

  const generateAdditionSingle = () => {
    const a = Math.floor(Math.random() * 10);
    const b = Math.floor(Math.random() * 10);
    return { display: `${a} + ${b} = ___`, answer: a + b, type: 'additionSingle' };
  };

  const generateAdditionDoubleNoCarry = () => {
    let a, b;
    do {
      a = Math.floor(Math.random() * 80) + 10;
      const maxB = 99 - a;
      b = Math.floor(Math.random() * (maxB - 9)) + 10;
      const onesA = a % 10;
      const onesB = b % 10;
      const tensA = Math.floor(a / 10);
      const tensB = Math.floor(b / 10);
      if (onesA + onesB < 10 && tensA + tensB < 10) break;
    } while (true);
    return { display: `${a} + ${b} = ___`, answer: a + b, type: 'additionDoubleNoCarry' };
  };

  const generateAdditionDoubleCarry = () => {
    let a, b;
    do {
      a = Math.floor(Math.random() * 80) + 10;
      const maxB = 99 - a;
      b = Math.floor(Math.random() * (maxB - 9)) + 10;
      const onesA = a % 10;
      const onesB = b % 10;
      const tensA = Math.floor(a / 10);
      const tensB = Math.floor(b / 10);
      if (onesA + onesB >= 10 || tensA + tensB >= 10) break;
    } while (true);
    return { display: `${a} + ${b} = ___`, answer: a + b, type: 'additionDoubleCarry' };
  };

  const generateSubtractionSingle = () => {
    const a = Math.floor(Math.random() * 10);
    const b = Math.floor(Math.random() * (a + 1));
    return { display: `${a} - ${b} = ___`, answer: a - b, type: 'subtractionSingle' };
  };

  const generateSubtractionDoubleNoCarry = () => {
    let a, b;
    do {
      a = Math.floor(Math.random() * 90) + 10;
      b = Math.floor(Math.random() * a) + 1;
      const onesA = a % 10;
      const onesB = b % 10;
      const tensA = Math.floor(a / 10);
      const tensB = Math.floor(b / 10);
      if (onesA >= onesB && tensA >= tensB && a - b >= 0) break;
    } while (true);
    return { display: `${a} - ${b} = ___`, answer: a - b, type: 'subtractionDoubleNoCarry' };
  };

  const generateSubtractionDoubleCarry = () => {
    let a, b;
    do {
      a = Math.floor(Math.random() * 90) + 10;
      b = Math.floor(Math.random() * a) + 1;
      const onesA = a % 10;
      const onesB = b % 10;
      const tensA = Math.floor(a / 10);
      const tensB = Math.floor(b / 10);
      if ((onesA < onesB || tensA < tensB) && a - b >= 0) break;
    } while (true);
    return { display: `${a} - ${b} = ___`, answer: a - b, type: 'subtractionDoubleCarry' };
  };

  const generateMultiplication = (table) => {
    const other = Math.floor(Math.random() * 12) + 1;
    const flip = Math.random() > 0.5;
    const [a, b] = flip ? [table, other] : [other, table];
    return { display: `${a} × ${b} = ___`, answer: a * b, type: `multiplication${table}` };
  };

  const generateDivision = (table) => {
    const other = Math.floor(Math.random() * 12) + 1;
    const product = table * other;
    return { display: `${product} ÷ ${table} = ___`, answer: other, type: `division${table}` };
  };

  const generateQuestions = () => {
    const activeCategories = [];
    if (categories.numberBonds5) activeCategories.push({ gen: generateNumberBond5, weight: 1 });
    if (categories.numberBonds10) activeCategories.push({ gen: generateNumberBond10, weight: 1 });
    if (categories.numberBonds100) activeCategories.push({ gen: generateNumberBond100, weight: 1 });
    if (categories.additionSingle) activeCategories.push({ gen: generateAdditionSingle, weight: 1 });
    if (categories.additionDoubleNoCarry) activeCategories.push({ gen: generateAdditionDoubleNoCarry, weight: 1 });
    if (categories.additionDoubleCarry) activeCategories.push({ gen: generateAdditionDoubleCarry, weight: 1 });
    if (categories.subtractionSingle) activeCategories.push({ gen: generateSubtractionSingle, weight: 1 });
    if (categories.subtractionDoubleNoCarry) activeCategories.push({ gen: generateSubtractionDoubleNoCarry, weight: 1 });
    if (categories.subtractionDoubleCarry) activeCategories.push({ gen: generateSubtractionDoubleCarry, weight: 1 });

    categories.multiplication.forEach(table => {
      activeCategories.push({ gen: () => generateMultiplication(table), weight: 1 });
    });

    categories.division.forEach(table => {
      activeCategories.push({ gen: () => generateDivision(table), weight: 1 });
    });

    if (activeCategories.length === 0) {
      alert('Please select at least one question type!');
      return null;
    }

    const questions = [];
    const questionPool = [];

    for (let i = 0; i < 500; i++) {
      const category = activeCategories[Math.floor(Math.random() * activeCategories.length)];
      const q = category.gen();
      const key = generateQuestionKey(q);
      const stats = getQuestionStats(key);

      let selectionWeight = 1;
      if (stats.recentAttempts > 0) {
        selectionWeight = 1 + (1 - stats.recentPercentage) * adaptiveWeight * 5;
      }

      questionPool.push({ ...q, key, selectionWeight });
    }

    for (let i = 0; i < 100; i++) {
      const totalWeight = questionPool.reduce((sum, q) => sum + q.selectionWeight, 0);
      let random = Math.random() * totalWeight;

      for (let j = 0; j < questionPool.length; j++) {
        random -= questionPool[j].selectionWeight;
        if (random <= 0) {
          questions.push({ ...questionPool[j], id: i });
          questionPool.splice(j, 1);
          break;
        }
      }

      if (questionPool.length === 0) break;
    }

    return questions;
  };

  // Grading helpers
  const handleGradeQuestion = (questionId, isCorrect, isIncomplete = false) => {
    const question = currentWorksheet.find(q => q.id === questionId);
    const key = question.key;
    const userData = getCurrentUserData();
    const newHistory = { ...userData.questionHistory };

    if (!isIncomplete) {
      if (!newHistory[key]) {
        newHistory[key] = { attempts: [], totalAsked: 0, totalCorrect: 0 };
      }
      newHistory[key].attempts.push(isCorrect);
      newHistory[key].totalAsked += 1;
      if (isCorrect) newHistory[key].totalCorrect += 1;
      saveUserData({ questionHistory: newHistory });
    }

    const updated = currentWorksheet.map(q =>
      q.id === questionId ? { ...q, graded: true, correct: isCorrect, incomplete: isIncomplete } : q
    );
    setCurrentWorksheet(updated);
    setGradingHistory(prev => [...prev, {
      questionId, wasCorrect: isCorrect, wasIncomplete: isIncomplete, key: key,
      previousUserData: userData.questionHistory[key] ? {...userData.questionHistory[key]} : null
    }]);

    if (updated.every(q => q.graded)) {
      const userWorksheets = savedWorksheets[currentUser] || {};
      if (userWorksheets[worksheetId]) {
        userWorksheets[worksheetId].graded = true;
        userWorksheets[worksheetId].questions = updated;
        saveWorksheets({ ...savedWorksheets, [currentUser]: userWorksheets });
      }
    }
  };

  const handleQuickGrade = () => {
    const parseNumbersWithRanges = (input) => {
      const numbers = [];
      const parts = input.split(',').map(p => p.trim());
      parts.forEach(part => {
        if (part.includes('-')) {
          const [start, end] = part.split('-').map(n => parseInt(n.trim()));
          if (!isNaN(start) && !isNaN(end) && start >= 1 && end <= 100 && start <= end) {
            for (let i = start; i <= end; i++) numbers.push(i);
          }
        } else {
          const num = parseInt(part);
          if (!isNaN(num) && num >= 1 && num <= 100) numbers.push(num);
        }
      });
      return numbers;
    };

    const wrongNumbers = parseNumbersWithRanges(quickGradeWrong);
    const incompleteNumbers = parseNumbersWithRanges(quickGradeIncomplete);

    if ((wrongNumbers.length === 0 && quickGradeWrong.trim() !== '') ||
        (incompleteNumbers.length === 0 && quickGradeIncomplete.trim() !== '')) {
      alert('Please enter question numbers separated by commas (e.g., 5,12,23)');
      return;
    }

    const userData = getCurrentUserData();
    const newHistory = { ...userData.questionHistory };
    const batchGradeHistory = [];

    currentWorksheet.forEach((question) => {
      const isIncomplete = incompleteNumbers.includes(question.id + 1);
      const isWrong = wrongNumbers.includes(question.id + 1);
      const isCorrect = !isWrong && !isIncomplete;
      const key = question.key;

      batchGradeHistory.push({
        questionId: question.id, wasCorrect: isCorrect, wasIncomplete: isIncomplete, key: key,
        previousUserData: userData.questionHistory[key] ? {...userData.questionHistory[key]} : null
      });

      if (!isIncomplete) {
        if (!newHistory[key]) {
          newHistory[key] = { attempts: [], totalAsked: 0, totalCorrect: 0 };
        }
        newHistory[key].attempts.push(isCorrect);
        newHistory[key].totalAsked += 1;
        if (isCorrect) newHistory[key].totalCorrect += 1;
      }

      question.graded = true;
      question.correct = isCorrect;
      question.incomplete = isIncomplete;
    });

    saveUserData({ questionHistory: newHistory });
    const userWorksheets = savedWorksheets[currentUser] || {};
    if (userWorksheets[worksheetId]) {
      userWorksheets[worksheetId].graded = true;
      userWorksheets[worksheetId].questions = currentWorksheet;
      saveWorksheets({ ...savedWorksheets, [currentUser]: userWorksheets });
    }

    setCurrentWorksheet([...currentWorksheet]);
    setGradingHistory(prev => [...prev, ...batchGradeHistory]);
  };

  const getUngradedWorksheets = () => {
    const userWorksheets = savedWorksheets[currentUser] || {};
    return Object.values(userWorksheets).filter(w => !w.graded);
  };

  const getGradedWorksheets = () => {
    const userWorksheets = savedWorksheets[currentUser] || {};
    const graded = Object.values(userWorksheets).filter(w => w.graded);
    graded.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return graded;
  };

  const deleteWorksheet = (worksheetId) => {
    if (window.confirm(`Are you sure you want to delete worksheet ${worksheetId}?`)) {
      const userWorksheets = savedWorksheets[currentUser] || {};
      delete userWorksheets[worksheetId];
      const newWorksheets = { ...savedWorksheets, [currentUser]: userWorksheets };
      saveWorksheets(newWorksheets);

      // Track deletion
      const worksheetKey = `${currentUser}:${worksheetId}`;
      const newDeleted = {
        ...deletedItems,
        worksheets: {
          ...deletedItems.worksheets,
          [worksheetKey]: new Date().toISOString()
        }
      };
      setDeletedItems(newDeleted);
      localStorage.setItem('mathPracticeDeleted', JSON.stringify(newDeleted));

      if (worksheetId === selectedWorksheetToGrade) {
        setCurrentWorksheet(null);
        setWorksheetId(null);
        setSelectedWorksheetToGrade('');
      }
    }
  };

  const handleRegenerateWorksheet = (sourceWorksheetId, targetUser = currentUser) => {
    const sourceUserWorksheets = savedWorksheets[currentUser] || {};
    const sourceWorksheet = sourceUserWorksheets[sourceWorksheetId];
    
    if (!sourceWorksheet) return;

    // Create new worksheet with same questions but fresh state
    const newQuestions = sourceWorksheet.questions.map((q, idx) => ({
      ...q,
      id: idx,
      graded: false,
      correct: undefined,
      incomplete: undefined
    }));

    const newId = `WS-${Date.now()}`;
    const newWorksheet = {
      id: newId,
      questions: newQuestions,
      user: targetUser,
      createdAt: new Date().toISOString(),
      graded: false,
      regeneratedFrom: sourceWorksheetId
    };

    const targetUserWorksheets = savedWorksheets[targetUser] || {};
    targetUserWorksheets[newId] = newWorksheet;

    const newWorksheets = {
      ...savedWorksheets,
      [targetUser]: targetUserWorksheets
    };
    saveWorksheets(newWorksheets);

    // Always switch to target user and show the worksheet
    setCurrentUser(targetUser);
    setWorksheetDisplayCount(5);
    setStatsDisplayCount(20);
    setCurrentWorksheet(newQuestions);
    setWorksheetId(newId);
    setView('worksheet');
  };

  const formatShortDate = (isoDate) => {
    if (!isoDate) return '';
    const d = new Date(isoDate);
    return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
  };
  
  // Sync TO cloud whenever data changes
  useEffect(() => {
    if (!user || !hasLoadedFromCloud.current) return;
    
    // Check if data actually changed
    const usersChanged = JSON.stringify(users) !== JSON.stringify(lastSyncedData.current.users);
    const dataChanged = JSON.stringify(allUserData) !== JSON.stringify(lastSyncedData.current.allUserData);
    const worksheetsChanged = JSON.stringify(savedWorksheets) !== JSON.stringify(lastSyncedData.current.savedWorksheets);
    const metaChanged = JSON.stringify(metaUpdatedAt) !== JSON.stringify(lastSyncedData.current.metaUpdatedAt);
    const deletedChanged = JSON.stringify(deletedItems) !== JSON.stringify(lastSyncedData.current.deletedItems);
    
    if (!usersChanged && !dataChanged && !worksheetsChanged && !metaChanged && !deletedChanged) {
      return; // Nothing changed, don't sync
    }

    const syncToCloud = async () => {
      try {
        await db.transact(
          db.tx.userData[user.id].update({
            users,
            allUserData,
            savedWorksheets,
            metaUpdatedAt,
            deletedItems,
            updatedAt: new Date().toISOString()
          })
        );
        console.log('✅ Synced to cloud');
        // Update ref to current state
        lastSyncedData.current = {
          users: JSON.parse(JSON.stringify(users)),
          allUserData: JSON.parse(JSON.stringify(allUserData)),
          savedWorksheets: JSON.parse(JSON.stringify(savedWorksheets)),
          metaUpdatedAt: JSON.parse(JSON.stringify(metaUpdatedAt)),
          deletedItems: JSON.parse(JSON.stringify(deletedItems))
        };
      } catch (err) {
        console.error('❌ Cloud sync error:', err);
      }
    };

    // Debounce: only sync after 1 second of no changes
    const timeoutId = setTimeout(syncToCloud, 1000);
    return () => clearTimeout(timeoutId);
  }, [user, users, allUserData, savedWorksheets, metaUpdatedAt, deletedItems]);

  // Load FROM cloud when data arrives (with conflict resolution)
  useEffect(() => {
    if (!user || cloudLoading || !cloudData) return;
    
    console.log('📦 Cloud data received:', cloudData);
    
    const userRecord = cloudData?.userData?.[0];
    
    if (userRecord) {
      console.log('✅ Found user record:', userRecord);
      
      const cloudMeta = userRecord.metaUpdatedAt || {};
      const localMeta = metaUpdatedAt || {};
      
      // MERGE USERS - combine both lists, respect deletions with timestamp comparison
      if (userRecord.users) {
        const localUsers = users || ['Default'];
        const cloudUsers = userRecord.users || [];
        const localDeleted = deletedItems.users || {};
        const cloudDeleted = userRecord.deletedItems?.users || {};
        const localMetaTime = metaUpdatedAt?.users || '1970-01-01';
        const cloudMetaTime = userRecord.metaUpdatedAt?.users || '1970-01-01';
        
        // Combine all users from both sources
        const combinedUsers = [...new Set([...localUsers, ...cloudUsers])];
        
        // Merge deleted lists with timestamp comparison
        const mergedDeleted = { ...localDeleted };
        Object.keys(cloudDeleted).forEach(userName => {
          if (!mergedDeleted[userName] || cloudDeleted[userName] > mergedDeleted[userName]) {
            mergedDeleted[userName] = cloudDeleted[userName];
          }
        });
        
        // For each user, check if they should be kept based on timestamps
        const mergedUsers = combinedUsers.filter(userName => {
          const deletionTime = mergedDeleted[userName];
          
          if (!deletionTime) {
            // Not deleted, keep the user
            return true;
          }
          
          // User was deleted - compare deletion time with when users list was last updated
          // If user exists locally and local meta is newer than deletion, keep local
          if (localUsers.includes(userName) && localMetaTime > deletionTime) {
            // Local recreation is newer than deletion
            delete mergedDeleted[userName]; // Clear the tombstone
            return true;
          }
          
          // If user exists in cloud and cloud meta is newer than deletion, keep cloud
          if (cloudUsers.includes(userName) && cloudMetaTime > deletionTime) {
            // Cloud recreation is newer than deletion
            delete mergedDeleted[userName]; // Clear the tombstone
            return true;
          }
          
          // Deletion is newer than any recreation, filter out
          return false;
        });
        
        if (JSON.stringify(mergedUsers.sort()) !== JSON.stringify(localUsers.sort())) {
          console.log('Merging users from cloud');
          setUsers(mergedUsers);
          localStorage.setItem('mathPracticeUsers', JSON.stringify(mergedUsers));
          lastSyncedData.current.users = JSON.parse(JSON.stringify(mergedUsers));
        }
        
        // Update merged deleted items (with tombstones cleared for recreated users)
        const newDeletedItems = { ...deletedItems, users: mergedDeleted };
        if (JSON.stringify(newDeletedItems) !== JSON.stringify(deletedItems)) {
          setDeletedItems(newDeletedItems);
          localStorage.setItem('mathPracticeDeleted', JSON.stringify(newDeletedItems));
          lastSyncedData.current.deletedItems = JSON.parse(JSON.stringify(newDeletedItems));
        }
      }
        
      // MERGE USER DATA - per-user granular merge
      if (userRecord.allUserData) {
        const localData = allUserData || {};
        const cloudData = userRecord.allUserData || {};
        const mergedData = { ...localData };
        
        // For each user in cloud data
        Object.keys(cloudData).forEach(userName => {
          const cloudUserData = cloudData[userName];
          const localUserData = localData[userName];
          
          if (!localUserData) {
            // User only exists in cloud - take cloud data
            mergedData[userName] = cloudUserData;
          } else {
            // User exists in both - compare timestamps
            const cloudUpdated = cloudUserData.updatedAt || '1970-01-01';
            const localUpdated = localUserData.updatedAt || '1970-01-01';
            
            if (cloudUpdated > localUpdated) {
              // Cloud data is newer for this user
              mergedData[userName] = cloudUserData;
            }
            // else keep local (already in mergedData)
          }
        });
        
        if (JSON.stringify(mergedData) !== JSON.stringify(localData)) {
          console.log('Merging allUserData from cloud');
          setAllUserData(mergedData);
          localStorage.setItem('mathPracticeAllData', JSON.stringify(mergedData));
          lastSyncedData.current.allUserData = JSON.parse(JSON.stringify(mergedData));
        }
      }
      
      // MERGE WORKSHEETS - per-worksheet granular merge, respect deletions with timestamp comparison
      if (userRecord.savedWorksheets) {
        const localSheets = savedWorksheets || {};
        const cloudSheets = userRecord.savedWorksheets || {};
        const localDeletedWorksheets = deletedItems.worksheets || {};
        const cloudDeletedWorksheets = userRecord.deletedItems?.worksheets || {};
        const localMetaTime = metaUpdatedAt?.savedWorksheets || '1970-01-01';
        const cloudMetaTime = userRecord.metaUpdatedAt?.savedWorksheets || '1970-01-01';
        
        // Merge deleted worksheets (keep most recent deletion timestamp)
        const mergedDeletedWorksheets = { ...localDeletedWorksheets };
        Object.keys(cloudDeletedWorksheets).forEach(key => {
          if (!mergedDeletedWorksheets[key] || cloudDeletedWorksheets[key] > mergedDeletedWorksheets[key]) {
            mergedDeletedWorksheets[key] = cloudDeletedWorksheets[key];
          }
        });
        
        const mergedSheets = { ...localSheets };
        
        // For each user in cloud worksheets
        Object.keys(cloudSheets).forEach(userName => {
          const cloudUserSheets = cloudSheets[userName] || {};
          const localUserSheets = localSheets[userName] || {};
          
          if (!mergedSheets[userName]) {
            mergedSheets[userName] = {};
          }
          
          // For each worksheet for this user
          Object.keys(cloudUserSheets).forEach(worksheetId => {
            const worksheetKey = `${userName}:${worksheetId}`;
            const deletionTime = mergedDeletedWorksheets[worksheetKey];
            
            const cloudWorksheet = cloudUserSheets[worksheetId];
            const localWorksheet = localUserSheets[worksheetId];
            
            // Check if worksheet was deleted and compare with creation/update times
            if (deletionTime) {
              const worksheetTime = cloudWorksheet?.updatedAt || cloudWorksheet?.createdAt || localWorksheet?.updatedAt || localWorksheet?.createdAt;
              
              // If worksheet exists and was created/updated after deletion, keep it and clear tombstone
              if (worksheetTime && worksheetTime > deletionTime) {
                delete mergedDeletedWorksheets[worksheetKey];
              } else {
                // Deletion is newer, skip this worksheet
                delete mergedSheets[userName][worksheetId];
                return;
              }
            }
            
            if (!localWorksheet) {
              // Worksheet only exists in cloud - take cloud version
              mergedSheets[userName][worksheetId] = cloudWorksheet;
            } else if (!cloudWorksheet) {
              // Worksheet only exists locally - keep local version (already in mergedSheets)
            } else {
              // Worksheet exists in both - compare timestamps
              // Prefer graded over ungraded, then use updatedAt/createdAt
              const cloudUpdated = cloudWorksheet.updatedAt || cloudWorksheet.createdAt || '1970-01-01';
              const localUpdated = localWorksheet.updatedAt || localWorksheet.createdAt || '1970-01-01';
              
              // If one is graded and other isn't, prefer graded
              if (cloudWorksheet.graded && !localWorksheet.graded) {
                mergedSheets[userName][worksheetId] = cloudWorksheet;
              } else if (localWorksheet.graded && !cloudWorksheet.graded) {
                // Keep local (already in mergedSheets)
              } else if (cloudUpdated > localUpdated) {
                // Cloud is newer
                mergedSheets[userName][worksheetId] = cloudWorksheet;
              }
              // else keep local (already in mergedSheets)
            }
          });
        });
        
        // Also check local worksheets that might not be in cloud
        Object.keys(localSheets).forEach(userName => {
          const localUserSheets = localSheets[userName] || {};
          Object.keys(localUserSheets).forEach(worksheetId => {
            const worksheetKey = `${userName}:${worksheetId}`;
            const deletionTime = mergedDeletedWorksheets[worksheetKey];
            
            if (deletionTime) {
              const localWorksheet = localUserSheets[worksheetId];
              const worksheetTime = localWorksheet?.updatedAt || localWorksheet?.createdAt;
              
              // If worksheet was created/updated after deletion, clear tombstone
              if (worksheetTime && worksheetTime > deletionTime) {
                delete mergedDeletedWorksheets[worksheetKey];
              } else {
                // Deletion is newer, remove worksheet
                if (mergedSheets[userName]) {
                  delete mergedSheets[userName][worksheetId];
                }
              }
            }
          });
        });
        
        if (JSON.stringify(mergedSheets) !== JSON.stringify(localSheets)) {
          console.log('Merging savedWorksheets from cloud');
          setSavedWorksheets(mergedSheets);
          localStorage.setItem('mathPracticeSavedWorksheets', JSON.stringify(mergedSheets));
          lastSyncedData.current.savedWorksheets = JSON.parse(JSON.stringify(mergedSheets));
        }
        
        // Update merged deleted worksheets (with tombstones cleared for recreated worksheets)
        const newDeletedItems = { ...deletedItems, worksheets: mergedDeletedWorksheets };
        if (JSON.stringify(newDeletedItems.worksheets) !== JSON.stringify(deletedItems.worksheets)) {
          setDeletedItems(newDeletedItems);
          localStorage.setItem('mathPracticeDeleted', JSON.stringify(newDeletedItems));
          lastSyncedData.current.deletedItems = JSON.parse(JSON.stringify(newDeletedItems));
        }
      }
      
      // Update metadata to reflect the merge
      if (cloudMeta && Object.keys(cloudMeta).length > 0) {
        const now = new Date().toISOString();
        const updatedMeta = {
          users: now, // Always update since we merged
          allUserData: now,
          savedWorksheets: now
        };
        setMetaUpdatedAt(updatedMeta);
        localStorage.setItem('mathPracticeMeta', JSON.stringify(updatedMeta));
        lastSyncedData.current.metaUpdatedAt = JSON.parse(JSON.stringify(updatedMeta));
      }
    } else {
      console.log('⚠️ No record found for user:', user.id);
    }
    
    // Mark that we've attempted to load from cloud
    hasLoadedFromCloud.current = true;
  }, [user, cloudData, cloudLoading]);

  return (
    <div className="min-h-screen bg-gray-100">
      {view === 'setup' && (
        <div className="max-w-6xl mx-auto p-6">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <div className="mb-6">
              <h1 className="text-3xl font-bold text-gray-800">Basic Math Facts Worksheet Generator</h1>
              {user && (
                <div className="text-sm text-gray-600 mt-1">Logged in as: {user.email}</div>
              )}
            </div>

            <div className="mb-6 p-4 bg-blue-50 border border-blue-300 rounded">
              <div className="flex items-center space-x-4">
                <label className="font-semibold">Current User:</label>
                <select
                  value={currentUser}
                  onChange={(e) => {
                    setCurrentUser(e.target.value);
                    setWorksheetDisplayCount(5);
                    setStatsDisplayCount(20);
                  }}
                  className="border border-gray-300 rounded px-3 py-2 flex-1"
                >
                  {users.map(user => (
                    <option key={user} value={user}>{user}</option>
                  ))}
                </select>
                <button
                  onClick={() => setShowUserModal(true)}
                  className="bg-green-600 text-white px-4 py-2 rounded font-semibold hover:bg-green-700"
                >
                  ➕ Add User
                </button>
                <button
                  onClick={() => setEditingUsers(true)}
                  className="bg-gray-600 text-white px-4 py-2 rounded font-semibold hover:bg-gray-700"
                >
                  ✏️ Edit Users
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-4 justify-center">
              <button
                onClick={() => setView('worksheetSettings')}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700"
              >
                📄 Create Worksheet
              </button>

              <button
                onClick={() => setView('grading')}
                className="bg-purple-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-purple-700"
              >
                ✓ Grade Worksheet
              </button>

              <button
                onClick={() => setView('progress')}
                className="bg-green-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-green-700"
              >
                📊 View Progress
              </button>

              <button
                onClick={() => setShowBackupModal(true)}
                className="bg-yellow-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-yellow-700"
              >
                💾 Backup & Restore
              </button>

              {user ? (
                <button
                  onClick={handleLogout}
                  className="bg-red-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-red-700"
                >
                  Log Out
                </button>
              ) : (
                <button
                  onClick={handleLogin}
                  className="bg-indigo-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-indigo-700"
                >
                  Login to Save Data
                </button>
              )}
            </div>
          </div>

          {showUserModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full">
                <h2 className="text-xl font-bold mb-4">Add New User</h2>
                <input
                  type="text"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  placeholder="Enter name"
                  className="border border-gray-300 rounded px-3 py-2 w-full mb-4"
                  onKeyPress={(e) => e.key === 'Enter' && addUser()}
                />
                <div className="flex space-x-3">
                  <button
                    onClick={addUser}
                    className="flex-1 bg-green-600 text-white px-4 py-2 rounded font-semibold hover:bg-green-700"
                  >
                    Add
                  </button>
                  <button
                    onClick={() => {
                      setShowUserModal(false);
                      setNewUserName('');
                    }}
                    className="flex-1 bg-gray-600 text-white px-4 py-2 rounded font-semibold hover:bg-gray-700"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {editingUsers && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full">
                <h2 className="text-xl font-bold mb-4">Edit Users</h2>
                <div className="space-y-2 mb-4">
                  {users.map(userName => (
                    <div key={userName} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                      <span>{userName}</span>
                      <button
                        onClick={() => deleteUser(userName)}
                        className="bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                      >
                        Delete
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() => setEditingUsers(false)}
                  className="w-full bg-gray-600 text-white px-4 py-2 rounded font-semibold hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </div>
          )}

          {showBackupModal && (
            <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
              <div className="bg-white rounded-lg p-6 max-w-md w-full">
                <h2 className="text-xl font-bold mb-4">Backup & Restore</h2>
                
                <div className="space-y-4">
                  <div>
                    <h3 className="font-semibold mb-2">Export Backup</h3>
                    <p className="text-sm text-gray-600 mb-3">
                      Download all your data as a backup file
                    </p>
                    <button
                      onClick={handleExport}
                      className="w-full bg-blue-600 text-white px-4 py-2 rounded font-semibold hover:bg-blue-700"
                    >
                      ⬇️ Export Data
                    </button>
                  </div>
                  
                  <div className="border-t pt-4">
                    <h3 className="font-semibold mb-2">Import Backup</h3>
                    <p className="text-sm text-gray-600 mb-3">
                      Restore data from a backup file (this will replace all current data)
                    </p>
                    <input
                      type="file"
                      accept=".json"
                      onChange={handleImport}
                      className="w-full text-sm"
                      id="import-file"
                    />
                  </div>
                  
                  {user && (
                    <div className="border-t pt-4">
                      <h3 className="font-semibold mb-2 text-red-600">⚠️ Wipe Cloud Data</h3>
                      <p className="text-sm text-gray-600 mb-3">
                        Delete all data from the cloud (your local data will remain). Use this to start fresh or before importing a backup.
                      </p>
                      <button
                        onClick={async () => {
                          if (window.confirm('⚠️ WARNING: This will permanently delete all your cloud data!\n\nYour local data will remain, but it will resync to the cloud.\n\nAre you absolutely sure?')) {
                            try {
                              await db.transact(
                                db.tx.userData[user.id].delete()
                              );
                              alert('Cloud data wiped successfully! Your local data remains and will resync.');
                              setShowBackupModal(false);
                            } catch (err) {
                              alert('Error wiping cloud data: ' + err.message);
                              console.error('Wipe error:', err);
                            }
                          }
                        }}
                        className="w-full bg-red-600 text-white px-4 py-2 rounded font-semibold hover:bg-red-700"
                      >
                        🗑️ Wipe Cloud Data
                      </button>
                    </div>
                  )}
                </div>
                
                <button
                  onClick={() => setShowBackupModal(false)}
                  className="w-full mt-6 bg-gray-600 text-white px-4 py-2 rounded font-semibold hover:bg-gray-700"
                >
                  Close
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {view === 'worksheetSettings' && (
        <div className="max-w-4xl mx-auto p-6">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h1 className="text-3xl font-bold mb-6 text-gray-800">Create Worksheet for {currentUser}</h1>

            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4 text-gray-700">Select Question Types</h2>

              <div className="mb-6">
                <h3 className="font-semibold mb-3 text-gray-600">Number Bonds</h3>
                <div className="grid grid-cols-3 gap-4">
                  {[
                    { key: 'numberBonds5', label: 'Number Bonds to 5' },
                    { key: 'numberBonds10', label: 'Number Bonds to 10' },
                    { key: 'numberBonds100', label: 'Number Bonds to 100' }
                  ].map(item => (
                    <label key={item.key} className="flex items-center space-x-3">
                      <input
                        type="checkbox"
                        checked={categories[item.key]}
                        onChange={(e) => setCategories({ ...categories, [item.key]: e.target.checked })}
                        className="w-5 h-5"
                      />
                      <span>{item.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mb-6">
                <h3 className="font-semibold mb-3 text-gray-600">Addition / Subtraction</h3>
                <div className="space-y-3">
                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { key: 'additionSingle', label: 'Addition Single Digit' },
                      { key: 'additionDoubleNoCarry', label: 'Addition Double Digit (no carrying)' },
                      { key: 'additionDoubleCarry', label: 'Addition Double Digit (carrying)' }
                    ].map(item => (
                      <label key={item.key} className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={categories[item.key]}
                          onChange={(e) => setCategories({ ...categories, [item.key]: e.target.checked })}
                          className="w-5 h-5"
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    {[
                      { key: 'subtractionSingle', label: 'Subtraction Single Digit' },
                      { key: 'subtractionDoubleNoCarry', label: 'Subtraction Double Digit (no borrowing)' },
                      { key: 'subtractionDoubleCarry', label: 'Subtraction Double Digit (borrowing)' }
                    ].map(item => (
                      <label key={item.key} className="flex items-center space-x-3">
                        <input
                          type="checkbox"
                          checked={categories[item.key]}
                          onChange={(e) => setCategories({ ...categories, [item.key]: e.target.checked })}
                          className="w-5 h-5"
                        />
                        <span>{item.label}</span>
                      </label>
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <h3 className="font-semibold mb-2">Multiplication Tables</h3>
                <div className="grid grid-cols-6 gap-2">
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                    <label key={n} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={categories.multiplication.includes(n)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCategories({ ...categories, multiplication: [...categories.multiplication, n] });
                          } else {
                            setCategories({ ...categories, multiplication: categories.multiplication.filter(x => x !== n) });
                          }
                        }}
                        className="w-4 h-4"
                      />
                      <span>{n}×</span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="mt-6">
                <h3 className="font-semibold mb-2">Division Tables</h3>
                <div className="grid grid-cols-6 gap-2">
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(n => (
                    <label key={n} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        checked={categories.division.includes(n)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setCategories({ ...categories, division: [...categories.division, n] });
                          } else {
                            setCategories({ ...categories, division: categories.division.filter(x => x !== n) });
                          }
                        }}
                        className="w-4 h-4"
                      />
                      <span>÷{n}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>

            <div className="mb-8 flex justify-start space-x-4">
              <button
                onClick={() => {
                  setCategories({
                    numberBonds5: true, numberBonds10: true, numberBonds100: true,
                    additionSingle: true, additionDoubleNoCarry: true, additionDoubleCarry: true,
                    subtractionSingle: true, subtractionDoubleNoCarry: true, subtractionDoubleCarry: true,
                    multiplication: [1,2,3,4,5,6,7,8,9,10,11,12],
                    division: [1,2,3,4,5,6,7,8,9,10,11,12]
                  });
                }}
                className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700"
              >
                ✓ Select All
              </button>
              <button
                onClick={() => {
                  setCategories({
                    numberBonds5: false, numberBonds10: false, numberBonds100: false,
                    additionSingle: false, additionDoubleNoCarry: false, additionDoubleCarry: false,
                    subtractionSingle: false, subtractionDoubleNoCarry: false, subtractionDoubleCarry: false,
                    multiplication: [], division: []
                  });
                }}
                className="bg-gray-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-gray-700"
              >
                ✗ Select None
              </button>
            </div>

            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4 text-gray-700">Adaptive Learning Weight</h2>
              <div className="flex items-center space-x-4">
                <span className="text-sm">Random</span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={adaptiveWeight}
                  onChange={(e) => setAdaptiveWeight(parseFloat(e.target.value))}
                  className="flex-1"
                />
                <span className="text-sm">Focus Struggles</span>
              </div>
              <p className="text-sm text-gray-600 mt-2">Current: {adaptiveWeight.toFixed(1)}</p>
            </div>

            <div className="flex space-x-4">
              <button
                onClick={() => {
                  const questions = generateQuestions();
                  if (questions) {
                    localStorage.setItem(`categories-${currentUser}`, JSON.stringify(categories));
                    const id = `WS-${Date.now()}`;
                    const worksheet = {
                      id: id, questions: questions, user: currentUser,
                      createdAt: new Date().toISOString(), graded: false
                    };
                    const userWorksheets = savedWorksheets[currentUser] || {};
                    userWorksheets[id] = worksheet;
                    const newWorksheets = { ...savedWorksheets, [currentUser]: userWorksheets };
                    saveWorksheets(newWorksheets);
                    
                    // If this worksheet was previously deleted, remove from tombstone list
                    const worksheetKey = `${currentUser}:${id}`;
                    if (deletedItems.worksheets[worksheetKey]) {
                      const newDeleted = {
                        ...deletedItems,
                        worksheets: { ...deletedItems.worksheets }
                      };
                      delete newDeleted.worksheets[worksheetKey];
                      setDeletedItems(newDeleted);
                      localStorage.setItem('mathPracticeDeleted', JSON.stringify(newDeleted));
                    }
                    setCurrentWorksheet(questions);
                    setWorksheetId(id);
                    setView('worksheet');
                  }
                }}
                className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700"
              >
                📄 Create Worksheet
              </button>

              <button
                onClick={() => setView('setup')}
                className="bg-gray-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-gray-700"
              >
                ← Back
              </button>
            </div>
          </div>
        </div>
      )}

      {view === 'worksheet' && currentWorksheet && (
        <div id="printable" className="p-8 bg-white" style={{ width: '210mm', minHeight: '297mm', margin: '0 auto' }}>
          <div className="mb-6 border-b-2 border-gray-300 pb-4">
            <h1 className="text-4xl font-bold text-center mb-4">Math Practice</h1>
            <div className="flex justify-between text-sm mb-2">
              <div>Name: <span className="font-semibold">{currentUser}</span></div>
              <div className="font-bold text-lg">ID: {worksheetId}</div>
            </div>
            <div className="flex justify-between text-sm">
              <div>Date: _________________________</div>
              <div>Time Taken: _________ minutes</div>
            </div>
            <div className="text-right text-sm mt-1">
              <div>Score: _____ / 100</div>
            </div>
          </div>

          <div className="grid grid-cols-4 gap-x-6 text-sm">
            {(() => {
              const columns = [[], [], [], []];
              currentWorksheet.forEach((q, idx) => {
                const col = Math.floor(idx / 25);
                columns[col].push({ ...q, displayNum: idx + 1 });
              });
              return columns.map((column, colIdx) => (
                <div key={colIdx} className="space-y-3">
                  {column.map((q) => (
                    <div key={q.displayNum} className="flex items-center space-x-2">
                      <span className="text-gray-500 w-7">{q.displayNum}.</span>
                      <span className="font-mono">{q.display}</span>
                    </div>
                  ))}
                </div>
              ));
            })()}
          </div>

          <div className="mt-6 text-sm text-gray-600 border-t border-gray-300 pt-2">
            <strong>Question Types:</strong> {Array.from(new Set(currentWorksheet.map(q => q.type))).join(', ')}
          </div>

          <div className="mt-8 flex justify-center space-x-4 print:hidden">
            <button
              onClick={() => window.print()}
              className="bg-blue-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-blue-700"
            >
              🖨️ Print Worksheet
            </button>

            <button
              onClick={() => setView('setup')}
              className="bg-gray-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-gray-700"
            >
              ← Back to Start
            </button>
          </div>
        </div>
      )}

      {view === 'grading' && (
        <div className="max-w-6xl mx-auto p-6">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h1 className="text-2xl font-bold mb-6">Grade Worksheet</h1>

            <div className="mb-6 p-4 bg-blue-50 border border-blue-300 rounded">
              <h3 className="font-semibold mb-3">Select Worksheet to Grade</h3>
              <div className="flex items-center space-x-3">
                <select
                  value={selectedWorksheetToGrade}
                  onChange={(e) => {
                    setGradingHistory([]);
                    const wsId = e.target.value;
                    if (!wsId) {
                      setCurrentWorksheet(null);
                      setWorksheetId(null);
                      setSelectedWorksheetToGrade('');
                      return;
                    }
                    const userWorksheets = savedWorksheets[currentUser] || {};
                    const worksheet = userWorksheets[wsId];
                    if (worksheet) {
                      setCurrentWorksheet(worksheet.questions);
                      setWorksheetId(wsId);
                      setSelectedWorksheetToGrade(wsId);
                      setQuickGradeWrong('');
                      setQuickGradeIncomplete('');
                    }
                  }}
                  className="border border-gray-300 rounded px-3 py-2 flex-1"
                >
                  <option value="">-- Select a worksheet --</option>
                  {getUngradedWorksheets().map(ws => (
                    <option key={ws.id} value={ws.id}>
                      {ws.id} (Created: {new Date(ws.createdAt).toLocaleDateString()})
                    </option>
                  ))}
                </select>
                {selectedWorksheetToGrade && (
                  <button
                    onClick={() => deleteWorksheet(selectedWorksheetToGrade)}
                    className="bg-red-600 text-white px-4 py-2 rounded font-semibold hover:bg-red-700"
                  >
                    🗑️ Delete
                  </button>
                )}
              </div>
              {getUngradedWorksheets().length === 0 && (
                <p className="text-sm text-gray-600 mt-2">No ungraded worksheets found.</p>
              )}
            </div>

            {currentWorksheet && (
              <>
                {currentWorksheet.every(q => q.graded) && (
                  <div className="mb-6 p-4 bg-green-100 border border-green-400 rounded">
                    <p className="font-semibold text-green-800">
                      All questions graded! Score: {currentWorksheet.filter(q => q.correct).length}/100
                    </p>
                  </div>
                )}

                {!currentWorksheet.every(q => q.graded) && (
                  <div className="mb-6 p-4 bg-blue-50 border border-blue-300 rounded">
                    <h3 className="font-semibold mb-2">Quick Grade Mode</h3>
                    <p className="text-sm text-gray-700 mb-3">Enter question numbers (e.g., 5,12,23 or 90-100)</p>
                    <div className="space-y-3">
                      <div className="flex items-center space-x-3">
                        <label className="w-32 font-semibold">Wrong:</label>
                        <input
                          type="text"
                          value={quickGradeWrong}
                          onChange={(e) => setQuickGradeWrong(e.target.value)}
                          placeholder="e.g., 5,12,23,90-100"
                          className="flex-1 border border-gray-300 rounded px-3 py-2"
                        />
                      </div>
                      <div className="flex items-center space-x-3">
                        <label className="w-32 font-semibold">Incomplete:</label>
                        <input
                          type="text"
                          value={quickGradeIncomplete}
                          onChange={(e) => setQuickGradeIncomplete(e.target.value)}
                          placeholder="e.g., 89,95-100"
                          className="flex-1 border border-gray-300 rounded px-3 py-2"
                        />
                      </div>
                      <button
                        onClick={handleQuickGrade}
                        className="w-full bg-green-600 text-white px-6 py-2 rounded-lg font-semibold hover:bg-green-700"
                      >
                        Grade All
                      </button>
                    </div>
                  </div>
                )}
                <button
                  onClick={() => {
                    setCurrentWorksheet(null);
                    setWorksheetId(null);
                    setSelectedWorksheetToGrade('');
                    setView('setup');
                  }}
                  className="bg-blue-600 text-white px-6 py-3 rounded-lg font-semibold hover:bg-blue-700 mb-6"
                >
                  ← Back to Start
                </button>
                <h3 className="font-semibold mb-3">Or grade individually:</h3>
                <div className="grid grid-cols-4 gap-6 mb-6">
                  {(() => {
                    const columns = [[], [], [], []];
                    currentWorksheet.forEach((q, idx) => {
                      const col = Math.floor(idx / 25);
                      columns[col].push({ ...q, displayNum: idx + 1 });
                    });
                    return columns.map((column, colIdx) => (
                      <div key={colIdx} className="space-y-3">
                        {column.map((q) => (
                          <div key={q.id} className={`p-3 border rounded ${
                            q.graded ? (
                              q.incomplete ? 'bg-gray-50 border-gray-300' :
                              q.correct ? 'bg-green-50 border-green-300' : 'bg-red-50 border-red-300'
                            ) : 'border-gray-300'
                          }`}>
                            <div className="text-sm font-mono mb-2">{q.displayNum}. {q.display}</div>
                            <div className="text-xs text-gray-600 mb-2">Answer: {q.answer}</div>
                            {!q.graded ? (
                              <div className="flex space-x-1">
                                <button
                                  onClick={() => handleGradeQuestion(q.id, true, false)}
                                  className="flex-1 bg-green-500 text-white px-2 py-1 rounded text-xs hover:bg-green-600"
                                  title="Correct"
                                >
                                  ✓
                                </button>
                                <button
                                  onClick={() => handleGradeQuestion(q.id, false, false)}
                                  className="flex-1 bg-red-500 text-white px-2 py-1 rounded text-xs hover:bg-red-600"
                                  title="Wrong"
                                >
                                  ✗
                                </button>
                                <button
                                  onClick={() => handleGradeQuestion(q.id, false, true)}
                                  className="flex-1 bg-gray-400 text-white px-2 py-1 rounded text-xs hover:bg-gray-500"
                                  title="Incomplete"
                                >
                                  •
                                </button>
                              </div>
                            ) : (
                              <div className="text-center font-semibold text-xs">
                                {q.incomplete ? '• Incomplete' : q.correct ? '✓ Correct' : '✗ Wrong'}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ));
                  })()}
                </div>
              </>
            )}

          </div>
        </div>
      )}

      {view === 'progress' && (
        <div className="max-w-6xl mx-auto p-6">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h1 className="text-2xl font-bold mb-6">Progress Report - {currentUser}</h1>
            
            <button
              onClick={() => setView('setup')}
              className="bg-blue-600 text-white px-4 py-2 rounded font-semibold hover:bg-blue-700 mb-4"
            >
              ← Back to Start
            </button>

            <h2 className="text-xl font-semibold mb-4">Previous Worksheet Results</h2>

            {getGradedWorksheets().length === 0 ? (
              <div className="p-6 bg-gray-50 border border-gray-300 rounded text-center">
                <p className="text-gray-600">No graded worksheets yet.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                <thead>
                    <tr className="border-b-2 border-gray-300">
                      <th className="text-center py-2 w-20">Date</th>
                      <th className="text-center py-2 w-20">Score</th>
                      <th className="text-left py-2 w-36">Worksheet ID</th>
                      <th className="text-left py-2 w-66">Question Types</th>
                      <th className="text-center py-2 w-20">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {getGradedWorksheets().map(ws => {
                      const totalQs = ws.questions?.length || 0;
                      const correct = ws.questions?.filter(q => q.correct).length || 0;
                      const percent = totalQs > 0 ? Math.round((correct / totalQs) * 100) : 0;
                      
                      // Get question types
                      const typeOrder = [
                        'numberBonds5',
                        'numberBonds10',
                        'numberBonds100',
                        'additionSingle',
                        'additionDoubleNoCarry',
                        'additionDoubleCarry',
                        'subtractionSingle',
                        'subtractionDoubleNoCarry',
                        'subtractionDoubleCarry',
                        ...Array.from({length: 12}, (_, i) => `multiplication${i + 1}`),
                        ...Array.from({length: 12}, (_, i) => `division${i + 1}`)
                      ];

                      const types = Array.from(new Set((ws.questions || []).map(q => q.type)))
                        .sort((a, b) => typeOrder.indexOf(a) - typeOrder.indexOf(b))
                        .join(', ');
                      
                      return (
                        <tr key={ws.id} className="border-b border-gray-200">
                          <td className="py-2 text-center">{formatShortDate(ws.createdAt)}</td>
                          <td className="py-2 text-center">
                            <span className={`font-semibold ${
                              percent >= 80 ? 'text-green-600' :
                              percent >= 60 ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                              {percent}%
                            </span>
                          </td>
                          <td className="py-2 font-mono">{ws.id}</td>
                          <td className="py-2 text-xs">{types}</td>
                          <td className="py-2 text-center">
                            <select
                              onChange={(e) => {
                                if (e.target.value) {
                                  handleRegenerateWorksheet(ws.id, e.target.value);
                                  e.target.value = '';
                                }
                              }}
                              className="text-xs border border-gray-300 rounded px-2 py-1"
                            >
                              <option value="">Copy to...</option>
                              <option value={currentUser}>📋 {currentUser} (me)</option>
                              {users.filter(u => u !== currentUser).map(user => (
                                <option key={user} value={user}>👤 {user}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;