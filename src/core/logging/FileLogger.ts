import * as fs from "fs"
import * as path from "path"
import { createWriteStream, WriteStream } from "fs"

export type LogLevel = 'INFO' | 'WARN' | 'ERROR' | 'DEBUG'

export interface LogMetadata {
	[key: string]: any
}

export interface LogEntry {
	timestamp: string
	level: LogLevel
	component: string
	message: string
	metadata?: LogMetadata
}

/**
 * FileLogger - Système de journalisation persistante pour diagnostic des crashes webview
 * 
 * Fonctionnalités :
 * - Logging persistant survit aux crashes de webview
 * - Support des niveaux de log (INFO, WARN, ERROR, DEBUG)
 * - Métadonnées structurées pour contexte enrichi
 * - Rotation automatique des logs si taille dépassée
 * - Thread-safe avec gestion d'erreurs gracieuse
 */
export class FileLogger {
	private logFilePath: string
	private logStream?: WriteStream
	private isInitialized: boolean = false
	private writeQueue: string[] = []
	private isWriting: boolean = false
	private maxLogFileSize: number = 10 * 1024 * 1024 // 10MB par défaut
	private maxLogFiles: number = 5

	constructor(baseDir: string, filename: string = 'roo-code-debug.log') {
		// Créer le répertoire .logs dans le baseDir
		const logsDir = path.join(baseDir, '.logs')
		this.logFilePath = path.join(logsDir, filename)
		
		// Initialisation asynchrone pour éviter de bloquer le constructeur
		this.initialize().catch(error => {
			console.error(`[FileLogger] Failed to initialize: ${error}`)
		})
	}

	/**
	 * Initialise le logger et crée le répertoire si nécessaire
	 */
	private async initialize(): Promise<void> {
		try {
			// Créer le répertoire .logs s'il n'existe pas
			const logsDir = path.dirname(this.logFilePath)
			await fs.promises.mkdir(logsDir, { recursive: true })

			// Vérifier si rotation nécessaire
			await this.checkAndRotateLog()

			// Créer le stream de log
			this.logStream = createWriteStream(this.logFilePath, { flags: 'a', encoding: 'utf8' })
			
			// Gérer les erreurs du stream
			this.logStream.on('error', (error) => {
				console.error(`[FileLogger] Stream error: ${error}`)
			})

			this.isInitialized = true
			
			// Écrire les messages en attente
			await this.processWriteQueue()

			// Log d'initialisation
			await this.log('INFO', 'FILE_LOGGER', 'FileLogger initialized successfully', {
				logFilePath: this.logFilePath,
				timestamp: new Date().toISOString()
			})

		} catch (error) {
			console.error(`[FileLogger] Initialization failed: ${error}`)
			this.isInitialized = false
		}
	}

	/**
	 * Vérifie la taille du fichier log et effectue une rotation si nécessaire
	 */
	private async checkAndRotateLog(): Promise<void> {
		try {
			const stats = await fs.promises.stat(this.logFilePath)
			
			if (stats.size > this.maxLogFileSize) {
				await this.rotateLogFiles()
			}
		} catch (error) {
			// Fichier n'existe pas encore, pas d'action nécessaire
			if (error.code !== 'ENOENT') {
				console.error(`[FileLogger] Error checking log file size: ${error}`)
			}
		}
	}

	/**
	 * Effectue la rotation des fichiers de log
	 */
	private async rotateLogFiles(): Promise<void> {
		try {
			const baseFilename = this.logFilePath
			const dir = path.dirname(baseFilename)
			const ext = path.extname(baseFilename)
			const name = path.basename(baseFilename, ext)

			// Décaler les fichiers existants (.1 -> .2, .2 -> .3, etc.)
			for (let i = this.maxLogFiles - 1; i >= 1; i--) {
				const currentFile = path.join(dir, `${name}.${i}${ext}`)
				const nextFile = path.join(dir, `${name}.${i + 1}${ext}`)
				
				try {
					await fs.promises.access(currentFile)
					if (i === this.maxLogFiles - 1) {
						// Supprimer le plus ancien
						await fs.promises.unlink(currentFile)
					} else {
						// Renommer vers le suivant
						await fs.promises.rename(currentFile, nextFile)
					}
				} catch {
					// Fichier n'existe pas, continuer
				}
			}

			// Renommer le fichier actuel vers .1
			const rotatedFile = path.join(dir, `${name}.1${ext}`)
			try {
				await fs.promises.rename(baseFilename, rotatedFile)
			} catch (error) {
				console.error(`[FileLogger] Error rotating main log file: ${error}`)
			}

		} catch (error) {
			console.error(`[FileLogger] Error during log rotation: ${error}`)
		}
	}

	/**
	 * Traite la queue d'écriture
	 */
	private async processWriteQueue(): Promise<void> {
		if (this.isWriting || !this.isInitialized || this.writeQueue.length === 0) {
			return
		}

		this.isWriting = true

		try {
			while (this.writeQueue.length > 0) {
				const logLine = this.writeQueue.shift()
				if (logLine && this.logStream) {
					await new Promise<void>((resolve, reject) => {
						this.logStream!.write(logLine, (error) => {
							if (error) reject(error)
							else resolve()
						})
					})
				}
			}
		} catch (error) {
			console.error(`[FileLogger] Error processing write queue: ${error}`)
		} finally {
			this.isWriting = false
		}
	}

	/**
	 * Log un message avec le niveau spécifié
	 */
	async log(level: LogLevel, component: string, message: string, metadata?: LogMetadata): Promise<void> {
		const logEntry: LogEntry = {
			timestamp: new Date().toISOString(),
			level,
			component,
			message,
			metadata
		}

		// Formatter la ligne de log
		const logLine = this.formatLogEntry(logEntry)

		// Ajouter à la queue
		this.writeQueue.push(logLine)

		// Traiter la queue si possible
		if (this.isInitialized) {
			await this.processWriteQueue()
		}

		// Aussi logger dans la console pour les erreurs
		if (level === 'ERROR' || level === 'WARN') {
			console.log(`[${level}] ${component}: ${message}`, metadata || '')
		}
	}

	/**
	 * Formate une entrée de log en ligne de texte
	 */
	private formatLogEntry(entry: LogEntry): string {
		const metadataStr = entry.metadata ? ` | ${JSON.stringify(entry.metadata)}` : ''
		return `[${entry.timestamp}] ${entry.level} ${entry.component}: ${entry.message}${metadataStr}\n`
	}

	/**
	 * Méthodes de convenance pour chaque niveau
	 */
	async info(component: string, message: string, metadata?: LogMetadata): Promise<void> {
		return this.log('INFO', component, message, metadata)
	}

	async warn(component: string, message: string, metadata?: LogMetadata): Promise<void> {
		return this.log('WARN', component, message, metadata)
	}

	async error(component: string, message: string, metadata?: LogMetadata): Promise<void> {
		return this.log('ERROR', component, message, metadata)
	}

	async debug(component: string, message: string, metadata?: LogMetadata): Promise<void> {
		return this.log('DEBUG', component, message, metadata)
	}

	/**
	 * Force l'écriture de tous les logs en attente et ferme le stream
	 */
	async dispose(): Promise<void> {
		try {
			// Traiter tous les messages en attente
			await this.processWriteQueue()

			// Log de fermeture
			if (this.isInitialized) {
				await this.log('INFO', 'FILE_LOGGER', 'FileLogger disposing', {
					pendingMessages: this.writeQueue.length
				})
			}

			// Fermer le stream
			if (this.logStream) {
				await new Promise<void>((resolve, reject) => {
					this.logStream!.end((error) => {
						if (error) reject(error)
						else resolve()
					})
				})
				this.logStream = undefined
			}

			this.isInitialized = false
		} catch (error) {
			console.error(`[FileLogger] Error during disposal: ${error}`)
		}
	}

	/**
	 * Retourne le chemin du fichier de log actuel
	 */
	getLogFilePath(): string {
		return this.logFilePath
	}

	/**
	 * Vérifie si le logger est initialisé
	 */
	isReady(): boolean {
		return this.isInitialized
	}
}