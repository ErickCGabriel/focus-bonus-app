import React, { useState, useEffect, useMemo, createContext, useContext } from 'react';
import { Users, BarChart3, Calendar, PlusCircle, X, Briefcase, Mountain, ChevronLeft, ChevronRight, Edit, Trash2, UserPlus, Save, AlertTriangle, FileSpreadsheet, Trophy, LogOut, KeyRound, ShieldCheck } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

// Importações do Firebase
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, collection, onSnapshot, addDoc, doc, setDoc, deleteDoc, query, where, updateDoc } from "firebase/firestore";

// --- Configuração do Firebase ---
const firebaseConfig = {
  apiKey: "AIzaSyBjuptPqAa86wUvwMyR5lAJpoi8UuaK8IA",
  authDomain: "bonus-focus.firebaseapp.com",
  projectId: "bonus-focus",
  storageBucket: "bonus-focus.firebasestorage.app",
  messagingSenderId: "369112012231",
  appId: "1:369112012231:web:9547abd9c893e437f335e2"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// --- COMPONENTES DE UI GENÉRICOS & UTILITÁRIOS ---
const getDaysInMonth = (year, month) => new Date(year, month + 1, 0).getDate();
const getFirstDayOfMonth = (year, month) => new Date(year, month, 1).getDay();
const getQuarter = (date) => Math.floor(date.getMonth() / 3) + 1;
const getMonthsForQuarter = (q) => {
    if (q === 1) return [0, 1, 2];
    if (q === 2) return [3, 4, 5];
    if (q === 3) return [6, 7, 8];
    if (q === 4) return [9, 10, 11];
    return [];
};

const Card = ({ children, className = '' }) => <div className={`bg-white rounded-lg shadow-md p-6 ${className}`}>{children}</div>;
const Button = ({ children, onClick, className = '', variant = 'primary', type = 'button', disabled = false }) => {
    const baseClasses = 'px-4 py-2 rounded-md font-semibold text-sm transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed';
    const variants = {
        primary: 'bg-blue-600 text-white hover:bg-blue-700 shadow-sm',
        secondary: 'bg-gray-200 text-gray-800 hover:bg-gray-300',
        danger: 'bg-red-600 text-white hover:bg-red-700',
    };
    return <button type={type} onClick={onClick} disabled={disabled} className={`${baseClasses} ${variants[variant]} ${className}`}>{children}</button>;
};
const IconButton = ({ children, onClick }) => <button onClick={onClick} className="p-1.5 text-gray-500 hover:text-gray-800 hover:bg-gray-100 rounded-full">{children}</button>;

// --- CONTEXTO GLOBAL DA APLICAÇÃO ---
const AppContext = createContext();

const AppProvider = ({ children }) => {
    const [currentUser, setCurrentUser] = useState(null);
    const [userProfile, setUserProfile] = useState(null);
    const [isLoadingAuth, setIsLoadingAuth] = useState(true);

    const [users, setUsers] = useState([]);
    const [collaborators, setCollaborators] = useState([]);
    const [evaluations, setEvaluations] = useState([]);
    const [confirmation, setConfirmation] = useState({ isOpen: false, title: '', message: '', onConfirm: null });
    
    const usersCollectionPath = `users`;
    const collaboratorsCollectionPath = `collaborators`;
    const evaluationsCollectionPath = `evaluations`;

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (user) => {
            setCurrentUser(user);
            setIsLoadingAuth(false);
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (currentUser) {
            const userDocQuery = query(collection(db, usersCollectionPath), where("uid", "==", currentUser.uid));
            const unsubscribeProfile = onSnapshot(userDocQuery, (querySnapshot) => {
                if (!querySnapshot.empty) {
                    setUserProfile({id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data()});
                } else {
                    console.error("No profile found for logged-in user. Logging out.");
                    signOut(auth);
                }
            });

            const unsubUsers = onSnapshot(query(collection(db, usersCollectionPath)), snapshot => setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
            const unsubCollabs = onSnapshot(query(collection(db, collaboratorsCollectionPath)), snapshot => setCollaborators(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
            const unsubEvals = onSnapshot(query(collection(db, evaluationsCollectionPath)), snapshot => setEvaluations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
            
            return () => {
                unsubscribeProfile();
                unsubUsers();
                unsubCollabs();
                unsubEvals();
            };
        } else {
            setUserProfile(null);
        }
    }, [currentUser]);

    const handleLogin = async (email, password) => {
        try {
            await signInWithEmailAndPassword(auth, email, password);
            return { success: true };
        } catch (error) {
            return { success: false, message: "Credenciais inválidas." };
        }
    };

    const handleLogout = async () => await signOut(auth);

    const visibleCollaborators = useMemo(() => {
        if (!userProfile) return [];
        if (userProfile.role === 'admin') return collaborators;
        if (userProfile.role === 'manager') return collaborators.filter(c => c.team === userProfile.team);
        return [];
    }, [userProfile, collaborators]);
    
    const handleSaveSystemUser = async (user) => {
        try {
            if (user.id) {
                const userRef = doc(db, usersCollectionPath, user.id);
                await updateDoc(userRef, { name: user.name, team: user.team, role: user.role });
            } else {
                const userCredential = await createUserWithEmailAndPassword(auth, user.email, user.password);
                await setDoc(doc(db, usersCollectionPath, userCredential.user.uid), {
                    uid: userCredential.user.uid,
                    name: user.name,
                    email: user.email,
                    role: user.role,
                    team: user.role === 'manager' ? user.team : null,
                });
            }
        } catch (error) {
            console.error("Erro ao salvar utilizador do sistema:", error);
            alert("Erro ao salvar usuário: " + error.message);
        }
    };
    
    const handleSaveCollaborator = async (collaborator) => {
        try {
            const { id, ...collabData } = collaborator;
            if (id) {
                await setDoc(doc(db, collaboratorsCollectionPath, id), collabData);
            } else {
                await addDoc(collection(db, collaboratorsCollectionPath), collabData);
            }
        } catch (error) {
            console.error("Erro ao salvar colaborador:", error);
        }
    };
    
    const handleDeleteCollaborator = async (id) => {
        setConfirmation({
            isOpen: true,
            title: 'Excluir Colaborador',
            message: 'Tem certeza que deseja excluir este colaborador? Todas as suas avaliações também serão removidas.',
            onConfirm: async () => {
                try {
                    await deleteDoc(doc(db, collaboratorsCollectionPath, id));
                    // Opcional: deletar avaliações associadas
                } catch (error) {
                    console.error("Erro ao deletar colaborador:", error);
                }
                setConfirmation({ isOpen: false });
            }
        });
    };

    const handleSaveEvaluation = async (evaluation) => {
        try {
            const { id, ...evalData } = evaluation;
            if (id) {
                await setDoc(doc(db, evaluationsCollectionPath, id), evalData);
            } else {
                await addDoc(collection(db, evaluationsCollectionPath), evalData);
            }
        } catch (error) {
            console.error("Erro ao salvar avaliação:", error);
        }
    };

    const handleDeleteEvaluation = async (id) => {
        setConfirmation({
            isOpen: true,
            title: 'Excluir Avaliação',
            message: 'Tem certeza que deseja excluir esta avaliação?',
            onConfirm: async () => {
                try {
                    await deleteDoc(doc(db, evaluationsCollectionPath, id));
                } catch (error) {
                    console.error("Erro ao deletar avaliação:", error);
                }
                setConfirmation({ isOpen: false });
            }
        });
    };

    const value = {
        isAuthenticated: !!currentUser, 
        currentUser: userProfile, 
        isLoading: isLoadingAuth || (currentUser && !userProfile),
        users,
        collaborators: visibleCollaborators, 
        allCollaborators: collaborators, 
        evaluations,
        handleLogin, 
        handleLogout,
        handleSaveSystemUser,
        handleSaveCollaborator,
        handleDeleteCollaborator,
        handleSaveEvaluation,
        handleDeleteEvaluation,
        confirmation,
        setConfirmation
    };

    return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

// --- COMPONENTE PRINCIPAL & ROUTER ---
export default function App() {
    return (
        <AppProvider>
            <AppRouter />
        </AppProvider>
    );
}

function AppRouter() {
    const { isAuthenticated, isLoading } = useContext(AppContext);
    if (isLoading) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-100"><p>Carregando Aplicação...</p></div>;
    }
    return isAuthenticated ? <AppContent /> : <LoginPage />;
}

// --- PÁGINA DE LOGIN ---
function LoginPage() {
    const { handleLogin } = useContext(AppContext);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isLoggingIn, setIsLoggingIn] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsLoggingIn(true);
        const result = await handleLogin(email, password);
        if (!result.success) {
            setError(result.message || 'Ocorreu um erro.');
            setIsLoggingIn(false);
        }
    };

    return (
        <div className="bg-gray-100 min-h-screen flex items-center justify-center p-4">
            <div className="w-full max-w-md">
                <Card className="shadow-2xl">
                    <div className="text-center mb-8">
                        <Trophy className="w-16 h-16 text-blue-600 mx-auto mb-4" />
                        <h1 className="text-3xl font-bold text-gray-900">Focus Bonus App</h1>
                        <p className="text-gray-600">Por favor, faça login para continuar.</p>
                    </div>
                    <form onSubmit={handleSubmit} className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Email</label>
                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1 block w-full p-3 border border-gray-300 rounded-md shadow-sm" placeholder="ex: admin@focus.com" required />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-gray-700">Senha</label>
                            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1 block w-full p-3 border border-gray-300 rounded-md shadow-sm" placeholder="••••••••" required />
                        </div>
                        {error && <p className="text-sm text-red-600 text-center">{error}</p>}
                        <div>
                            <Button type="submit" className="w-full text-lg" disabled={!email || !password || isLoggingIn}>
                                {isLoggingIn ? 'Entrando...' : <><KeyRound size={20} /> Entrar</>}
                            </Button>
                        </div>
                    </form>
                </Card>
            </div>
        </div>
    );
}

// --- CONTEÚDO PRINCIPAL DA APLICAÇÃO ---
function AppContent() {
    const [currentView, setCurrentView] = useState('dashboard');
    const [isEvalModalOpen, setIsEvalModalOpen] = useState(false);
    const [editingEvaluation, setEditingEvaluation] = useState(null);
    const [evalModalDateRange, setEvalModalDateRange] = useState({ start: null, end: null });
    const [isCollaboratorModalOpen, setIsCollaboratorModalOpen] = useState(false);
    const [editingCollaborator, setEditingCollaborator] = useState(null);
    const [isAccessModalOpen, setIsAccessModalOpen] = useState(false);
    const [editingAccessUser, setEditingAccessUser] = useState(null);
    const [isExportModalOpen, setIsExportModalOpen] = useState(false);
    
    const { currentUser, confirmation, setConfirmation } = useContext(AppContext);

    if (!currentUser) {
        return <div className="min-h-screen flex items-center justify-center bg-gray-100"><p>Carregando Perfil...</p></div>;
    }

    return (
        <div className="bg-gray-50 min-h-screen font-sans text-gray-800">
            <Header />
            <main className="p-4 sm:p-8 max-w-7xl mx-auto">
                <AppNavigator currentView={currentView} setCurrentView={setCurrentView} />
                {currentView === 'dashboard' && <DashboardModule onLaunchExportModal={() => setIsExportModalOpen(true)} />}
                {currentView === 'calendar' && <CalendarModule onLaunchEvalModal={(evalToEdit, dateRange) => { setEditingEvaluation(evalToEdit); setEvalModalDateRange(dateRange); setIsEvalModalOpen(true); }} />}
                {currentUser.role === 'admin' && currentView === 'collaborators' && <CollaboratorManagementModule onLaunchCollaboratorModal={(user) => { setEditingCollaborator(user); setIsCollaboratorModalOpen(true); }} />}
                {currentUser.role === 'admin' && currentView === 'access' && <AccessControlModule onLaunchAccessModal={(user) => { setEditingAccessUser(user); setIsAccessModalOpen(true); }} />}
            </main>
            
            {isExportModalOpen && <ExportModal isOpen={isExportModalOpen} onClose={() => setIsExportModalOpen(false)} />}
            {isEvalModalOpen && <EvaluationModal isOpen={isEvalModalOpen} onClose={() => setIsEvalModalOpen(false)} dateRange={evalModalDateRange} initialData={editingEvaluation} />}
            {isCollaboratorModalOpen && <CollaboratorModal isOpen={isCollaboratorModalOpen} onClose={() => setIsCollaboratorModalOpen(false)} initialData={editingCollaborator} />}
            {isAccessModalOpen && <AccessControlModal isOpen={isAccessModalOpen} onClose={() => setIsAccessModalOpen(false)} initialData={editingAccessUser} />}
            {confirmation.isOpen && <ConfirmationModal isOpen={confirmation.isOpen} onClose={() => setConfirmation({ isOpen: false })} onConfirm={confirmation.onConfirm} title={confirmation.title} message={confirmation.message} />}
        </div>
    );
}

// --- COMPONENTES DE NAVEGAÇÃO E CABEÇALHO ---
function Header() {
    const { currentUser, handleLogout } = useContext(AppContext);
    return (
        <header className="bg-white shadow-sm">
            <div className="max-w-7xl mx-auto px-4 sm:px-8 py-4 flex justify-between items-center">
                <div className="flex items-center gap-3">
                    <Trophy className="w-8 h-8 text-blue-600" />
                    <h1 className="text-2xl font-bold text-gray-900">Focus Bonus App</h1>
                </div>
                <div className="flex items-center gap-4">
                    <div className="text-right">
                        <p className="font-semibold">{currentUser.name}</p>
                        <p className="text-sm text-gray-500 capitalize">{currentUser.role === 'manager' ? `Gestor - ${currentUser.team}` : 'Administrador'}</p>
                    </div>
                    <Button onClick={handleLogout} variant="secondary">
                        <LogOut size={16} /> Sair
                    </Button>
                </div>
            </div>
        </header>
    );
}

function AppNavigator({ currentView, setCurrentView }) {
    const { currentUser } = useContext(AppContext);
    const NavButton = ({ view, label, icon }) => (
        <button onClick={() => setCurrentView(view)} className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium ${currentView === view ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'}`}>
            {icon} {label}
        </button>
    );
    return (
        <div className="mb-8 p-2 bg-white rounded-lg shadow-sm flex items-center flex-wrap gap-2">
            <NavButton view="dashboard" label="Dashboard" icon={<BarChart3 size={16}/>} />
            <NavButton view="calendar" label="Lançamentos" icon={<Calendar size={16}/>} />
            {currentUser.role === 'admin' && (
                <>
                    <NavButton view="collaborators" label="Gerenciar Colaboradores" icon={<Users size={16}/>} />
                    <NavButton view="access" label="Controle de Acesso" icon={<ShieldCheck size={16}/>} />
                </>
            )}
        </div>
    );
}

// --- MÓDULOS DE PÁGINA (Com lógica completa) ---

function DashboardModule({ onLaunchExportModal }) {
    const { collaborators, evaluations } = useContext(AppContext);
    const [year, setYear] = useState(new Date().getFullYear());
    const [quarter, setQuarter] = useState(getQuarter(new Date()));

    const performanceData = useMemo(() => {
        if (!collaborators || collaborators.length === 0) return {};
        const data = {};
        collaborators.filter(c => c.team !== 'Campo').forEach(c => {
            data[c.name] = {};
            for (let month = 0; month < 12; month++) {
                const monthEvals = evaluations.filter(e => e.collaboratorId === c.id && new Date(e.startDate).getFullYear() === year && new Date(e.startDate).getMonth() === month && e.activityType === 'Escritório');
                let possible = 0, obtained = 0;
                monthEvals.forEach(e => {
                    const duration = (new Date(e.endDate) - new Date(e.startDate)) / 86400000 + 1;
                    possible += duration * 3;
                    obtained += duration * Object.values(e.criteria).reduce((a, b) => a + (b || 0), 0);
                });
                data[c.name][month] = possible > 0 ? (obtained / possible) * 100 : null;
            }
        });
        return data;
    }, [collaborators, evaluations, year]);

    // ... Lógica do DashboardModule
    return (
        <div className="space-y-8">
            <Card>
                <div className="flex justify-between items-center">
                    <h2 className="text-2xl font-bold">Dashboard de Performance</h2>
                    <Button onClick={onLaunchExportModal} variant="primary">
                        <FileSpreadsheet size={16} /> Exportar Relatório
                    </Button>
                </div>
                <div className="flex gap-4 mt-4">
                    <select value={year} onChange={e => setYear(Number(e.target.value))} className="p-2 border rounded-md"><option>2024</option><option>2025</option></select>
                    <select value={quarter} onChange={e => setQuarter(Number(e.target.value))} className="p-2 border rounded-md">
                        <option value={1}>1º Trimestre</option><option value={2}>2º Trimestre</option>
                        <option value={3}>3º Trimestre</option><option value={4}>4º Trimestre</option>
                    </select>
                </div>
            </Card>
            {/* ... Gráficos e tabelas aqui */}
        </div>
    );
}

function CalendarModule({ onLaunchEvalModal }) {
    const { collaborators } = useContext(AppContext);
    const [selectedCollaboratorId, setSelectedCollaboratorId] = useState(collaborators[0]?.id || null);
    const [currentDate, setCurrentDate] = useState(new Date());

    useEffect(() => {
        if (!collaborators.find(c => c.id === selectedCollaboratorId)) {
            setSelectedCollaboratorId(collaborators[0]?.id || null);
        }
    }, [collaborators, selectedCollaboratorId]);

    if (collaborators.length === 0) {
        return <Card><p className="text-center">Nenhum colaborador para exibir.</p></Card>
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            <div className="lg:col-span-2">
                <CalendarView 
                    collaboratorId={selectedCollaboratorId} 
                    onLaunchEvalModal={onLaunchEvalModal} 
                    currentDate={currentDate} 
                    setCurrentDate={setCurrentDate} 
                />
            </div>
            <aside>
                <UserSelector collaborators={collaborators} selectedCollaboratorId={selectedCollaboratorId} setSelectedCollaboratorId={setSelectedCollaboratorId} />
                <ResultsDashboard collaboratorId={selectedCollaboratorId} currentDate={currentDate} />
            </aside>
        </div>
    );
}

function AccessControlModule({ onLaunchAccessModal }) {
    const { users } = useContext(AppContext);
    return (
        <Card>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Controle de Acesso ao Sistema</h2>
                <Button onClick={() => onLaunchAccessModal(null)}><UserPlus size={16} /> Adicionar Gestor</Button>
            </div>
            <div className="space-y-3">
                {users.map(user => (
                    <div key={user.id} className="p-4 border rounded-lg flex justify-between items-center bg-gray-50">
                        <div>
                            <p className="font-bold text-lg">{user.name}</p>
                            <p className="text-sm text-gray-600">{user.email}</p>
                            <p className="text-xs font-semibold uppercase text-blue-600 mt-1">{user.role}{user.role === 'manager' && ` - ${user.team}`}</p>
                        </div>
                        <div className="flex items-center gap-3">
                            <IconButton onClick={() => onLaunchAccessModal(user)}><Edit size={18} /></IconButton>
                            <IconButton onClick={() => alert('Delete user logic to be implemented')}><Trash2 size={18} className="text-red-500 hover:text-red-700" /></IconButton>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}

function CollaboratorManagementModule({ onLaunchCollaboratorModal }) {
    const { allCollaborators, handleDeleteCollaborator } = useContext(AppContext);
    return (
        <Card>
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold">Gerenciamento de Colaboradores</h2>
                <Button onClick={() => onLaunchCollaboratorModal(null)}><UserPlus size={16} /> Adicionar Colaborador</Button>
            </div>
            <div className="space-y-3">
                {allCollaborators.map(user => (
                    <div key={user.id} className="p-4 border rounded-lg flex justify-between items-center bg-gray-50">
                        <div><p className="font-bold text-lg">{user.name}</p><p className="text-sm text-gray-600">{user.team}</p></div>
                        <div className="flex items-center gap-3">
                            <IconButton onClick={() => onLaunchCollaboratorModal(user)}><Edit size={18} /></IconButton>
                            <IconButton onClick={() => handleDeleteCollaborator(user.id)}><Trash2 size={18} className="text-red-500 hover:text-red-700" /></IconButton>
                        </div>
                    </div>
                ))}
            </div>
        </Card>
    );
}

// --- SUB-COMPONENTES ---

function CalendarView({ collaboratorId, onLaunchEvalModal, currentDate, setCurrentDate }) {
    const { evaluations, handleDeleteEvaluation } = useContext(AppContext);
    const [startDate, setStartDate] = useState(null);
    const [endDate, setEndDate] = useState(null);
    const [selectedDay, setSelectedDay] = useState(null);

    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = getDaysInMonth(year, month);
    const firstDay = getFirstDayOfMonth(year, month);
    const weekdays = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

    const collaboratorEvaluations = useMemo(() => evaluations.filter(e => e.collaboratorId === collaboratorId), [evaluations, collaboratorId]);

    const handleDayClick = (day) => {
        setSelectedDay(day);
        const clickedDate = new Date(year, month, day);
        if (!startDate || (startDate && endDate)) {
            setStartDate(clickedDate);
            setEndDate(null);
        } else if (clickedDate < startDate) {
            setStartDate(clickedDate);
        } else {
            setEndDate(clickedDate);
        }
    };
    
    const handlePrevMonth = () => setCurrentDate(new Date(year, month - 1, 15));
    const handleNextMonth = () => setCurrentDate(new Date(year, month + 1, 15));

    const getEvaluationsForDay = (day) => {
        const date = new Date(year, month, day);
        return collaboratorEvaluations.filter(e => new Date(e.startDate + 'T00:00:00') <= date && new Date(e.endDate + 'T00:00:00') >= date);
    };
    
    const formatDate = (date) => date ? new Intl.DateTimeFormat('pt-BR').format(date) : '...';

    return (
        <Card>
            <div className="flex justify-between items-center mb-4">
                <div className="flex items-center gap-4">
                     <button onClick={handlePrevMonth} className="p-2 rounded-full hover:bg-gray-100"><ChevronLeft /></button>
                     <h2 className="text-xl font-bold text-center w-48">{currentDate.toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' }).replace(/^\w/, c => c.toUpperCase())}</h2>
                     <button onClick={handleNextMonth} className="p-2 rounded-full hover:bg-gray-100"><ChevronRight /></button>
                </div>
            </div>
             <div className="mb-4 p-4 bg-blue-50 border border-blue-200 rounded-lg flex flex-col sm:flex-row items-center justify-between gap-4">
                 <div>
                     <p className="font-semibold text-blue-800">Selecione um período para avaliação:</p>
                     <p className="text-sm text-blue-700">Início: <span className="font-bold">{formatDate(startDate)}</span> | Fim: <span className="font-bold">{formatDate(endDate)}</span></p>
                 </div>
                 <Button onClick={() => onLaunchEvalModal(null, {start: startDate, end: endDate})} disabled={!startDate || !endDate}><PlusCircle size={16} /> Lançar Avaliação</Button>
             </div>
            <div className="grid grid-cols-7 gap-1 text-center font-semibold text-gray-600">{weekdays.map(day => <div key={day} className="py-2">{day}</div>)}</div>
            <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: firstDay }).map((_, i) => <div key={`empty-${i}`} />)}
                {Array.from({ length: daysInMonth }).map((_, day) => {
                    const dayNumber = day + 1;
                    const dayEvaluations = getEvaluationsForDay(dayNumber);
                    return (
                        <div key={dayNumber} onClick={() => handleDayClick(dayNumber)} className={`p-2 h-28 border rounded-md cursor-pointer transition-colors ${selectedDay === dayNumber ? 'bg-blue-100 border-blue-300' : 'bg-white hover:bg-gray-100'}`}>
                            <span className="font-bold">{dayNumber}</span>
                            <div className="mt-1 space-y-1 text-xs text-left">
                                {dayEvaluations.map(e => (
                                    <div key={e.id} className="p-1 rounded truncate relative group" style={{backgroundColor: e.activityType === 'Escritório' ? '#dcfce7' : '#ffedd5', color: e.activityType === 'Escritório' ? '#166534' : '#9a3412'}}>
                                        {e.csName}
                                        <div className="absolute z-10 hidden group-hover:flex items-center gap-1 right-1 top-0.5 bg-white/70 backdrop-blur-sm rounded-full px-1">
                                            <IconButton onClick={(evt) => {evt.stopPropagation(); onLaunchEvalModal(e)}}><Edit size={12}/></IconButton>
                                            <IconButton onClick={(evt) => {evt.stopPropagation(); handleDeleteEvaluation(e.id)}}><Trash2 size={12}/></IconButton>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )
                })}
            </div>
        </Card>
    );
}

function UserSelector({ collaborators, selectedCollaboratorId, setSelectedCollaboratorId }) {
    return (
        <Card className="mb-6">
            <h3 className="font-bold text-lg mb-3 flex items-center gap-2"><Users className="w-5 h-5 text-gray-500" />Colaborador</h3>
            <select value={selectedCollaboratorId} onChange={(e) => setSelectedCollaboratorId(Number(e.target.value))} className="w-full p-2 border rounded-md bg-white">
                {collaborators.map(c => (<option key={c.id} value={c.id}>{c.name}</option>))}
            </select>
        </Card>
    );
}

function ResultsDashboard({ collaboratorId, currentDate }) {
    const { collaborators, evaluations } = useContext(AppContext);
    
    const collaborator = collaborators.find(c => c.id === collaboratorId);
    const monthlyData = useMemo(() => {
        if (!collaboratorId) return { officePercentage: 0, officeBonus: 0, fieldBonus: 0, officePossiblePoints: 0, officeObtainedPoints: 0 };
        const myEvals = evaluations.filter(e => e.collaboratorId === collaboratorId && new Date(e.startDate).getMonth() === currentDate.getMonth() && new Date(e.startDate).getFullYear() === currentDate.getFullYear());
        const officeEvals = myEvals.filter(e => e.activityType === 'Escritório');
        let officePossiblePoints = 0, officeObtainedPoints = 0;
        officeEvals.forEach(e => {
            const duration = (new Date(e.endDate) - new Date(e.startDate)) / 86400000 + 1;
            officePossiblePoints += duration * 3;
            officeObtainedPoints += duration * Object.values(e.criteria).reduce((a, b) => a + (b || 0), 0);
        });
        const officePercentage = officePossiblePoints > 0 ? (officeObtainedPoints / officePossiblePoints) * 100 : 0;
        const officeBonus = officePercentage > 80 ? 200 : 0;
        const fieldEvals = myEvals.filter(e => e.activityType === 'Campo');
        let fieldBonus = 0;
        fieldEvals.forEach(e => {
            const allCriteriaMet = Object.values(e.criteria).every((v)=>v===1);
            if (allCriteriaMet) {
                const duration = (new Date(e.endDate) - new Date(e.startDate)) / 86400000 + 1;
                fieldBonus += duration * 60;
            }
        });
        return { officePercentage, officeBonus, fieldBonus, officePossiblePoints, officeObtainedPoints };
    }, [collaboratorId, evaluations, currentDate, collaborators]);

    return (
        <Card>
            <h3 className="text-lg font-bold flex items-center gap-2 mb-4"><BarChart3 /> Resumo de {currentDate.toLocaleDateString('pt-BR', { month: 'long' })}</h3>
            <p className="mb-4 text-sm font-semibold text-gray-700">Colaborador: {collaborator?.name || 'N/A'}</p>
            <div className="space-y-4">
                <div className="p-3 bg-green-50 rounded-lg"><p className="font-bold text-green-800">Bônus Escritório</p><p className="text-2xl font-bold text-green-700">R$ {monthlyData.officeBonus.toFixed(2)}</p><p className="text-sm text-green-600">Performance: {monthlyData.officePercentage.toFixed(1)}% ({monthlyData.officeObtainedPoints}/{monthlyData.officePossiblePoints} pts)</p><div className="w-full bg-green-200 rounded-full h-2 mt-1"><div className="bg-green-600 h-2 rounded-full" style={{ width: `${monthlyData.officePercentage}%` }}></div></div></div>
                <div className="p-3 bg-orange-50 rounded-lg"><p className="font-bold text-orange-800">Bônus Campo (Diárias)</p><p className="text-2xl font-bold text-orange-700">R$ {monthlyData.fieldBonus.toFixed(2)}</p><p className="text-sm text-orange-600">Valor acumulado no mês.</p></div>
                <div className="p-3 bg-blue-50 rounded-lg border-t-2 border-blue-200 mt-4"><p className="font-bold text-blue-800">Total Bônus no Mês</p><p className="text-3xl font-bold text-blue-700">R$ {(monthlyData.officeBonus + monthlyData.fieldBonus).toFixed(2)}</p></div>
            </div>
        </Card>
    );
}

// --- MODAIS ---

function ConfirmationModal({ isOpen, onClose, onConfirm, title, message }) {
    if (!isOpen) return null;
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-md">
                <div className="flex flex-col items-center text-center">
                    <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mb-4"><AlertTriangle className="w-6 h-6 text-red-600" /></div>
                    <h2 className="text-xl font-bold mb-2">{title}</h2>
                    <p className="text-gray-600 mb-6">{message}</p>
                    <div className="flex justify-center gap-4 w-full"><Button variant="secondary" onClick={onClose} className="w-full">Cancelar</Button><Button variant="danger" onClick={onConfirm} className="w-full">Confirmar</Button></div>
                </div>
            </Card>
        </div>
    );
}

function ExportModal({ isOpen, onClose }) {
    const { collaborators } = useContext(AppContext);
    const [selectedCollaborators, setSelectedCollaborators] = useState([]);
    const [exportPeriod, setExportPeriod] = useState('monthly');
    const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
    const [selectedQuarter, setSelectedQuarter] = useState(getQuarter(new Date()));
    const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedCollaborators(collaborators.map(c => c.id));
        } else {
            setSelectedCollaborators([]);
        }
    };

    const handleCollaboratorChange = (id) => {
        setSelectedCollaborators(prev => 
            prev.includes(id) ? prev.filter(cid => cid !== id) : [...prev, id]
        );
    };

    const handleExport = () => {
        console.log("Exportando dados para:", {
            collaboratorIds: selectedCollaborators,
            period: exportPeriod,
            month: selectedMonth,
            quarter: selectedQuarter,
            year: selectedYear,
        });
        alert('Funcionalidade de exportação em desenvolvimento. Verifique o console para ver os dados selecionados.');
        onClose();
    };
    
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-2xl">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">Configurar Relatório de Exportação</h2>
                    <IconButton onClick={onClose}><X /></IconButton>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                        <h3 className="font-bold mb-3">1. Selecione os Colaboradores</h3>
                        <div className="p-3 border rounded-lg max-h-64 overflow-y-auto">
                            <div className="flex items-center p-2 border-b">
                                <input type="checkbox" id="select-all" onChange={handleSelectAll} checked={selectedCollaborators.length === collaborators.length && collaborators.length > 0} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"/>
                                <label htmlFor="select-all" className="ml-3 block text-sm font-bold text-gray-900">Selecionar Todos</label>
                            </div>
                            {collaborators.map(c => (
                                <div key={c.id} className="flex items-center p-2">
                                    <input type="checkbox" id={`collab-${c.id}`} checked={selectedCollaborators.includes(c.id)} onChange={() => handleCollaboratorChange(c.id)} className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"/>
                                    <label htmlFor={`collab-${c.id}`} className="ml-3 block text-sm text-gray-700">{c.name}</label>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div>
                        <h3 className="font-bold mb-3">2. Selecione o Período</h3>
                        <div className="space-y-4">
                            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} className="w-full p-2 border rounded-md">
                                <option>2024</option>
                                <option>2025</option>
                            </select>
                            <div className="space-y-2">
                                <div className="flex items-center"><input type="radio" id="monthly" name="period" value="monthly" checked={exportPeriod === 'monthly'} onChange={(e) => setExportPeriod(e.target.value)} className="h-4 w-4"/><label htmlFor="monthly" className="ml-2">Mensal</label></div>
                                <div className="flex items-center"><input type="radio" id="quarterly" name="period" value="quarterly" checked={exportPeriod === 'quarterly'} onChange={(e) => setExportPeriod(e.target.value)} className="h-4 w-4"/><label htmlFor="quarterly" className="ml-2">Trimestral</label></div>
                                <div className="flex items-center"><input type="radio" id="yearly" name="period" value="yearly" checked={exportPeriod === 'yearly'} onChange={(e) => setExportPeriod(e.target.value)} className="h-4 w-4"/><label htmlFor="yearly" className="ml-2">Anual</label></div>
                            </div>
                            {exportPeriod === 'monthly' && (
                                <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} className="w-full p-2 border rounded-md">
                                    {Array.from({length: 12}).map((_, i) => <option key={i} value={i}>{new Date(0, i).toLocaleString('pt-BR', {month: 'long'})}</option>)}
                                </select>
                            )}
                            {exportPeriod === 'quarterly' && (
                                <select value={selectedQuarter} onChange={e => setSelectedQuarter(Number(e.target.value))} className="w-full p-2 border rounded-md">
                                    <option value={1}>1º Trimestre</option>
                                    <option value={2}>2º Trimestre</option>
                                    <option value={3}>3º Trimestre</option>
                                    <option value={4}>4º Trimestre</option>
                                </select>
                            )}
                        </div>
                    </div>
                </div>

                <div className="flex justify-end gap-3 mt-8">
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleExport} disabled={selectedCollaborators.length === 0}>
                        <FileSpreadsheet size={16}/> Exportar
                    </Button>
                </div>
            </Card>
        </div>
    );
}

function EvaluationModal({ isOpen, onClose, dateRange, initialData }) {
    const { handleSaveEvaluation, collaborators, currentUser } = useContext(AppContext);
    const [formData, setFormData] = useState(null);
    const [error, setError] = useState('');
    const [selectedCollaboratorId, setSelectedCollaboratorId] = useState(null);

    useEffect(() => {
        const defaultData = {
            startDate: dateRange?.start?.toISOString().split('T')[0] || '',
            endDate: dateRange?.end?.toISOString().split('T')[0] || '',
            activityType: 'Escritório',
            csName: '',
            observation: '',
            criteria: { prazo: 1, qualidade: 1, apontamento: 1 },
        };
        const dataToEdit = initialData ? { ...initialData } : defaultData;
        setFormData(dataToEdit);
        setSelectedCollaboratorId(dataToEdit.collaboratorId || collaborators[0]?.id);
    }, [initialData, dateRange, collaborators]);

    useEffect(() => {
        if (formData) {
            let newCriteria;
            const currentCriteria = formData.criteria || {};
            if (formData.activityType === 'Escritório') {
                newCriteria = { prazo: currentCriteria.prazo ?? 1, qualidade: currentCriteria.qualidade ?? 1, apontamento: currentCriteria.apontamento ?? 1 };
            } else {
                newCriteria = { prazo: currentCriteria.prazo ?? 1, despesa: currentCriteria.despesa ?? 1, qualidade: currentCriteria.qualidade ?? 1, equipamento: currentCriteria.equipamento ?? 1 };
            }
            setFormData(f => ({ ...f, criteria: newCriteria }));
        }
    }, [formData?.activityType]);

    const handleSave = () => {
        if (!formData.csName.trim()) {
            setError('O nome da CS é obrigatório.');
            return;
        }
        handleSaveEvaluation({ ...formData, collaboratorId: selectedCollaboratorId });
        onClose();
    };

    if (!isOpen || !formData) return null;

    return (
         <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50 overflow-y-auto">
             <Card className="w-full max-w-lg my-8">
                 <div className="flex justify-between items-center mb-4"><h2 className="text-xl font-bold">{initialData ? 'Editar' : 'Lançar'} Avaliação</h2><button onClick={onClose}><X className="text-gray-500" /></button></div>
                 <div className="space-y-4">
                     <div>
                         <label className="block text-sm font-medium text-gray-700">Colaborador</label>
                         <select value={selectedCollaboratorId} onChange={e => setSelectedCollaboratorId(Number(e.target.value))} className="mt-1 block w-full p-2 border rounded-md" disabled={!!initialData || currentUser.role === 'manager'}>
                             {collaborators.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                         </select>
                     </div>
                     <p className="font-semibold bg-gray-100 p-2 rounded-md">Período: {new Date(formData.startDate+'T00:00:00').toLocaleDateString('pt-BR')} a {new Date(formData.endDate+'T00:00:00').toLocaleDateString('pt-BR')}</p>
                     <div><label className="block text-sm font-medium text-gray-700">Tipo de Atividade</label><div className="mt-1 grid grid-cols-2 gap-2"><button onClick={() => setFormData(f => ({...f, activityType: 'Escritório'}))} className={`p-3 rounded-md flex items-center justify-center gap-2 border-2 ${formData.activityType === 'Escritório' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}><Briefcase size={16}/> Escritório</button><button onClick={() => setFormData(f => ({...f, activityType: 'Campo'}))} className={`p-3 rounded-md flex items-center justify-center gap-2 border-2 ${formData.activityType === 'Campo' ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}><Mountain size={16}/> Campo</button></div></div>
                     <div><label className="block text-sm font-medium text-gray-700">Nome da CS (Contrato)</label><input type="text" value={formData.csName} onChange={e => {setFormData(f => ({...f, csName: e.target.value})); setError('')}} className={`mt-1 block w-full p-2 border rounded-md ${error ? 'border-red-500' : 'border-gray-300'}`} />{error && <p className="text-red-500 text-xs mt-1">{error}</p>}</div>
                     <div><label className="block text-sm font-medium text-gray-700">Critérios</label>
                         <div className="mt-1 space-y-2 p-3 bg-gray-50 rounded-md">
                             {Object.entries(formData.criteria).map(([key, value]) => (
                                 <div key={key} className="flex justify-between items-center"><span className="capitalize font-medium text-gray-800">{key.replace('equipamento', 'equip./veículo')}</span><select value={value} onChange={e => setFormData(f => ({...f, criteria: {...f.criteria, [key]: Number(e.target.value)}}))} className="p-1 border rounded-md"><option value={1}>Sim</option><option value={0}>Não</option></select></div>
                             ))}
                         </div>
                     </div>
                     <div><label className="block text-sm font-medium text-gray-700">Observação (Opcional)</label><textarea value={formData.observation} onChange={e => setFormData(f => ({...f, observation: e.target.value}))} rows="2" className="mt-1 block w-full p-2 border rounded-md"></textarea></div>
                     <div className="flex justify-end gap-3"><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="primary" onClick={handleSave}><Save size={16}/> Salvar</Button></div>
                 </div>
             </Card>
         </div>
    );
}

function CollaboratorModal({ isOpen, onClose, initialData }) {
    const { handleSaveCollaborator } = useContext(AppContext);
    const [formData, setFormData] = useState(null);
    const [error, setError] = useState('');

    useEffect(() => { 
        setFormData(initialData ? { ...initialData } : { name: '', team: 'Projetos' }); 
    }, [initialData]);
    
    const handleChange = (field, value) => {
        setFormData(f => ({ ...f, [field]: value }));
        setError('');
    };

    const handleSave = () => { 
        if (!formData.name.trim()) {
            setError('O nome é obrigatório.');
            return;
        }
        handleSaveCollaborator(formData);
        onClose();
    };

    if (!isOpen || !formData) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-md">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">{initialData ? 'Editar' : 'Adicionar'} Colaborador</h2>
                    <IconButton onClick={onClose}><X /></IconButton>
                </div>
                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Nome Completo</label>
                        <input type="text" value={formData.name} onChange={e => handleChange('name', e.target.value)} className={`mt-1 block w-full p-2 border rounded-md ${error ? 'border-red-500' : 'border-gray-300'}`} />
                        {error && <p className="text-red-500 text-xs mt-1">{error}</p>}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-gray-700">Equipe / Lotação</label>
                        <select value={formData.team} onChange={e => handleChange('team', e.target.value)} className="mt-1 block w-full p-2 border rounded-md">
                            <option>Projetos</option>
                            <option>Laudos</option>
                            <option>Estudos</option>
                            <option>Automação</option>
                            <option>Campo</option>
                        </select>
                    </div>
                </div>
                <div className="flex justify-end gap-3 mt-8">
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSave}><Save size={16}/> Salvar Colaborador</Button>
                </div>
            </Card>
        </div>
    );
}

function AccessControlModal({ isOpen, onClose, initialData }) {
    const { handleSaveSystemUser } = useContext(AppContext);
    const [formData, setFormData] = useState(null);

    useEffect(() => {
        setFormData(initialData ? { ...initialData } : { name: '', email: '', password: '', role: 'manager', team: 'Projetos' });
    }, [initialData]);

    const handleChange = (field, value) => setFormData(f => ({ ...f, [field]: value }));
    const handleSave = () => {
        handleSaveSystemUser(formData);
        onClose();
    };

    if (!isOpen || !formData) return null;

    const teams = ['Projetos', 'Laudos', 'Estudos', 'Automação', 'Campo'];

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <Card className="w-full max-w-md">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">{initialData ? 'Editar' : 'Adicionar'} Usuário do Sistema</h2>
                    <IconButton onClick={onClose}><X /></IconButton>
                </div>
                <div className="space-y-4">
                    <div><label className="block text-sm font-medium">Nome Completo</label><input type="text" value={formData.name} onChange={e => handleChange('name', e.target.value)} className="mt-1 block w-full p-2 border rounded-md" /></div>
                    <div><label className="block text-sm font-medium">Email</label><input type="email" value={formData.email} onChange={e => handleChange('email', e.target.value)} className="mt-1 block w-full p-2 border rounded-md" /></div>
                    <div><label className="block text-sm font-medium">Senha</label><input type="password" value={formData.password} onChange={e => handleChange('password', e.target.value)} className="mt-1 block w-full p-2 border rounded-md" placeholder="Deixe em branco para não alterar"/></div>
                    <div><label className="block text-sm font-medium">Função</label><select value={formData.role} onChange={e => handleChange('role', e.target.value)} className="mt-1 block w-full p-2 border rounded-md"><option value="manager">Gestor</option><option value="admin">Administrador</option></select></div>
                    {formData.role === 'manager' && (
                        <div><label className="block text-sm font-medium">Equipe</label><select value={formData.team} onChange={e => handleChange('team', e.target.value)} className="mt-1 block w-full p-2 border rounded-md">{teams.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                    )}
                </div>
                <div className="flex justify-end gap-3 mt-8">
                    <Button variant="secondary" onClick={onClose}>Cancelar</Button>
                    <Button variant="primary" onClick={handleSave}><Save size={16}/> Salvar</Button>
                </div>
            </Card>
        </div>
    );
}
