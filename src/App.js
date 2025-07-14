import React, { useState, useEffect, useMemo, createContext, useContext } from 'react';
import { Users, BarChart3, Calendar, PlusCircle, X, Target, Briefcase, Mountain, ChevronLeft, ChevronRight, Edit, Trash2, UserPlus, Save, AlertTriangle, FileSpreadsheet, Trophy, LogOut, KeyRound, ShieldCheck } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, LineChart, Line } from 'recharts';

// Importações do Firebase
import { initializeApp } from "firebase/app";
import { getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, collection, onSnapshot, addDoc, doc, setDoc, deleteDoc, query, where, getDocs } from "firebase/firestore";
import { getAnalytics } from "firebase/analytics";

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
const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;

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
    const [isLoading, setIsLoading] = useState(true);

    const [users, setUsers] = useState([]);
    const [collaborators, setCollaborators] = useState([]);
    const [evaluations, setEvaluations] = useState([]);
    const [confirmation, setConfirmation] = useState({ isOpen: false, title: '', message: '', onConfirm: null });
    
    const usersCollectionPath = `users`;
    const collaboratorsCollectionPath = `collaborators`;
    const evaluationsCollectionPath = `evaluations`;

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (user) => {
            if (user) {
                setCurrentUser(user);
                const userDocQuery = query(collection(db, usersCollectionPath), where("uid", "==", user.uid));
                const unsubscribeProfile = onSnapshot(userDocQuery, (querySnapshot) => {
                    if (!querySnapshot.empty) {
                        setUserProfile({id: querySnapshot.docs[0].id, ...querySnapshot.docs[0].data()});
                    } else {
                        setUserProfile(null);
                    }
                    setIsLoading(false);
                });
                return () => unsubscribeProfile();
            } else {
                setCurrentUser(null);
                setUserProfile(null);
                setIsLoading(false);
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!userProfile) return;
        
        const qUsers = query(collection(db, usersCollectionPath));
        const unsubscribeUsers = onSnapshot(qUsers, (snapshot) => setUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));

        const qCollaborators = query(collection(db, collaboratorsCollectionPath));
        const unsubscribeCollaborators = onSnapshot(qCollaborators, (snapshot) => setCollaborators(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));

        const qEvaluations = query(collection(db, evaluationsCollectionPath));
        const unsubscribeEvaluations = onSnapshot(qEvaluations, (snapshot) => setEvaluations(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));

        return () => {
            unsubscribeUsers();
            unsubscribeCollaborators();
            unsubscribeEvaluations();
        };
    }, [userProfile, usersCollectionPath, collaboratorsCollectionPath, evaluationsCollectionPath]);

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
    
    const handleSaveSystemUser = async (user) => { /* ... */ };
    const handleSaveCollaborator = async (collaborator) => { /* ... */ };
    const handleDeleteCollaborator = async (id) => { /* ... */ };
    const handleSaveEvaluation = async (evaluation) => { /* ... */ };
    const handleDeleteEvaluation = async (id) => { /* ... */ };

    const value = {
        isAuthenticated: !!currentUser, currentUser: userProfile, isLoading, users,
        collaborators: visibleCollaborators, allCollaborators: collaborators, evaluations,
        handleLogin, handleLogout, handleSaveSystemUser, handleSaveCollaborator, handleDeleteCollaborator,
        handleSaveEvaluation, handleDeleteEvaluation, confirmation, setConfirmation
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
        }
        setIsLoggingIn(false);
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

// --- MÓDULOS DE PÁGINA ---

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

    const quarterlyWinners = useMemo(() => {
        const teams = [...new Set(collaborators.filter(c => c.team !== 'Campo').map(c => c.team))];
        const winners = {};
        const months = getMonthsForQuarter(quarter);
        
        teams.forEach(team => {
            const teamMembers = collaborators.filter(c => c.team === team);
            let bestPerformer = null;
            let maxScore = -1;

            teamMembers.forEach(member => {
                const memberData = performanceData[member.name];
                if(!memberData) return;
                const isEligible = months.every(m => memberData[m] === null || memberData[m] > 80);
                
                if (isEligible) {
                    const quarterEvals = evaluations.filter(e => e.collaboratorId === member.id && new Date(e.startDate).getFullYear() === year && months.includes(new Date(e.startDate).getMonth()) && e.activityType === 'Escritório');
                    const score = quarterEvals.reduce((acc, e) => {
                        const duration = (new Date(e.endDate) - new Date(e.startDate)) / 86400000 + 1;
                        return acc + (duration * Object.values(e.criteria).reduce((a, b) => a + (b || 0), 0));
                    }, 0);

                    if (score > maxScore) {
                        maxScore = score;
                        bestPerformer = member.name;
                    }
                }
            });
            winners[team] = bestPerformer;
        });
        return winners;

    }, [collaborators, evaluations, performanceData, quarter, year]);

    const chartData = useMemo(() => {
        const data = [];
        for (let month = 0; month < 12; month++) {
            const monthName = new Date(year, month).toLocaleString('pt-BR', { month: 'short' });
            const entry = { name: monthName.replace('.','').toUpperCase() };
            Object.keys(performanceData).forEach(name => {
                const perf = performanceData[name][month];
                if (perf !== null) entry[name] = perf;
            });
            data.push(entry);
        }
        return data;
    }, [performanceData, year]);

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
            {/* O resto do JSX do DashboardModule vai aqui */}
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
    // ... Lógica interna do CalendarView
    return <Card>Visualização do Calendário</Card>;
}

function UserSelector({ collaborators, selectedCollaboratorId, setSelectedCollaboratorId }) {
    // ... Lógica interna do UserSelector
    return <Card>Seletor de Utilizador</Card>;
}

function ResultsDashboard({ collaboratorId, currentDate }) {
    const { collaborators, evaluations } = useContext(AppContext);
    const monthlyData = useMemo(() => {
        if (!collaboratorId) return { officePercentage: 0, officeBonus: 0, fieldBonus: 0, officePossiblePoints: 0, officeObtainedPoints: 0 };
        const myEvals = evaluations.filter(e => e.collaboratorId === collaboratorId && new Date(e.startDate).getMonth() === currentDate.getMonth() && new Date(e.startDate).getFullYear() === currentDate.getFullYear());
        const officeEvals = myEvals.filter(e => e.activityType === 'Escritório');
        let officePossiblePoints = 0, officeObtainedPoints = 0;
        officeEvals.forEach(e => {
            const duration = (new Date(e.endDate) - new Date(e.startDate)) / 86400000 + 1;
            officePossiblePoints += duration * 3;
            // CORREÇÃO DO ERRO: usar officeObtainedPoints em vez de 'obtained'
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

    return <Card>Dashboard de Resultados</Card>;
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
    // ... resto da lógica do ExportModal
    if (!isOpen) return null;
    return <div className="fixed inset-0 bg-black bg-opacity-50 z-50">Modal de Exportação</div>;
}

function EvaluationModal({ isOpen, onClose, dateRange, initialData }) {
    // ... Lógica interna do EvaluationModal
    if (!isOpen) return null;
    return <div className="fixed inset-0 bg-black bg-opacity-50 z-50">Modal de Avaliação</div>;
}

function CollaboratorModal({ isOpen, onClose, initialData }) {
    // ... Lógica interna do CollaboratorModal
    if (!isOpen) return null;
    return <div className="fixed inset-0 bg-black bg-opacity-50 z-50">Modal de Colaborador</div>;
}

function AccessControlModal({ isOpen, onClose, initialData }) {
    // ... Lógica interna do AccessControlModal
    if (!isOpen) return null;
    return <div className="fixed inset-0 bg-black bg-opacity-50 z-50">Modal de Controlo de Acesso</div>;
}
